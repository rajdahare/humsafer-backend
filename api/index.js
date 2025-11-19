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
// serverless-http converts Vercel's request format to Express format
const serverlessHandler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream']
});

// Custom wrapper to intercept OPTIONS requests
// Vercel passes (req, res) format, so we check req.method
const handler = (req, res) => {
  // Intercept OPTIONS requests before serverless-http processes them
  if (req.method && req.method.toUpperCase() === 'OPTIONS') {
    console.log('[Handler] OPTIONS preflight request intercepted');
    console.log('[Handler] Method:', req.method);
    console.log('[Handler] URL:', req.url);
    console.log('[Handler] Headers:', JSON.stringify(req.headers));
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo, firebase-auth-token, x-stream, X-Stream, Accept, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // Return 200 OK immediately
    res.writeHead(200);
    res.end();
    return;
  }
  
  // For all other requests, delegate to serverless-http handler
  return serverlessHandler(req, res);
};

// Export handler for Vercel
module.exports = handler;

