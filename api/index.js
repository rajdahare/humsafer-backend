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

// Import modules
const { requireAuth, asyncHandler } = require('../utils');
const ai = require('../ai');
const schedule = require('../schedule');
const expense = require('../expense');
const razorpay = require('../razorpay');
const auth = require('../auth');

const app = express();

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
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Apply CORS middleware FIRST - this handles OPTIONS automatically
app.use(cors(corsOptions));

// Explicit OPTIONS handler as backup (CORS middleware should handle this, but ensure it works)
app.options('*', (req, res) => {
  console.log('[Express] OPTIONS request received for:', req.url || req.path);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo, firebase-auth-token, x-stream, X-Stream, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).send('');
});

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

// Wrap Express app with serverless-http for Vercel compatibility
// This ensures proper handling of OPTIONS requests and other HTTP methods
const handler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream']
});

// Export handler for Vercel
module.exports = handler;

