// Vercel Serverless Function Entry Point
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

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

// Import modules
const { requireAuth, asyncHandler } = require('../utils');
const ai = require('../ai');
const schedule = require('../schedule');
const expense = require('../expense');
const razorpay = require('../razorpay');
const auth = require('../auth');

const app = express();

// CRITICAL: Handle OPTIONS requests FIRST, before any other middleware
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo, firebase-auth-token, x-stream, X-Stream, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  return res.status(200).end();
});

// CORS Configuration - Handle preflight requests
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins (including localhost for development)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token', 'x-stream', 'X-Stream', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// Health check (PUBLIC - NO AUTH)
app.get('/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    firebase: firebaseInitialized ? 'initialized' : 'not initialized'
  });
});

app.get('/api/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  // Set CORS headers on actual response
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
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

// Vercel-compatible handler that ensures OPTIONS requests are handled
const handler = async (req, res) => {
  // Handle OPTIONS preflight requests FIRST
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo, firebase-auth-token, x-stream, X-Stream, Accept, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }
  
  // For all other requests, use Express app
  return app(req, res);
};

// Export for Vercel
module.exports = handler;

