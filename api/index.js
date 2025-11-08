// Vercel Serverless Function Entry Point
require('dotenv').config();
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin
let firebaseInitialized = false;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized from environment');
  } else if (!admin.apps.length) {
    admin.initializeApp();
    console.log('⚠️ Firebase initialized without credentials');
  }
} catch (error) {
  console.warn('⚠️ Firebase initialization failed:', error.message);
  try {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
  } catch (e) {
    // Ignore
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

// CORS Configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token'],
}));

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
app.post('/ai/process', requireAuth, asyncHandler(ai.processMessage));
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

// Export for Vercel
module.exports = app;

