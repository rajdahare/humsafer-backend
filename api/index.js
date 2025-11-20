// Vercel Serverless Function Entry Point
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');

// Initialize Firebase Admin (only once)
let firebaseInitialized = false;

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
      console.log('✅ Firebase initialized from environment');
    } else {
      admin.initializeApp();
      console.log('⚠️ Firebase initialized without credentials');
    }
  } catch (error) {
    console.warn('⚠️ Firebase initialization failed:', error.message);
  }
}

// Import modules with error handling
let requireAuth, asyncHandler, ai, schedule, expense, razorpay, auth;
try {
  console.log('[Init] Loading utils...');
  const utils = require('../utils');
  requireAuth = utils.requireAuth;
  asyncHandler = utils.asyncHandler;
  console.log('[Init] ✅ Utils loaded');

  console.log('[Init] Loading ai module...');
  ai = require('../ai');
  console.log('[Init] ✅ AI module loaded');

  console.log('[Init] Loading other modules...');
  schedule = require('../schedule');
  expense = require('../expense');
  razorpay = require('../razorpay');
  auth = require('../auth');
  console.log('[Init] ✅ All modules loaded successfully');
} catch (error) {
  console.error('❌ Error loading modules:', error);
  console.error('❌ Error stack:', error.stack);
  // Don't throw - let the app start and handle errors gracefully
  // This allows health check to work even if some modules fail
}

const app = express();

const parseAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || !raw.trim()) {
    return ['*'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
console.log('[CORS] Allowed origins:', allowedOrigins.join(', '));

// Enhanced CORS configuration (matching server.local.js)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token', 'x-stream', 'X-Stream', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Middleware - Apply CORS first
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes

app.use(express.json({ limit: '10mb' }));

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    message: 'Humsafer API Server',
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    firebase: firebaseInitialized ? 'initialized' : 'not initialized',
    endpoints: {
      health: '/health',
      apiHealth: '/api/health'
    }
  });
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    firebase: firebaseInitialized ? 'initialized' : 'not initialized'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    firebase: firebaseInitialized ? 'initialized' : 'not initialized'
  });
});

// API routes (all require authentication)
// Support streaming when client asks (X-Stream: 1 or body.stream === true)
app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
  const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
  if (wantsStream) {
    return ai.processMessageStream(req, res);
  }
  return ai.processMessage(req, res);
}));
app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));
app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));
app.post('/expense/add', requireAuth, asyncHandler(expense.add));
app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));
app.post('/razorpay/create-order', requireAuth, asyncHandler(razorpay.createOrder));
app.post('/razorpay/verify-payment', requireAuth, asyncHandler(razorpay.verifyPayment));

// Subscription management
app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
  const uid = req.userId;
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  const tier = userDoc.data()?.subscriptionTier || null;
  const status = userDoc.data()?.subscriptionStatus || null;
  return res.json({ tier, status });
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Wrap Express app with serverless-http
// This is required for Vercel serverless functions
module.exports = serverless(app);

