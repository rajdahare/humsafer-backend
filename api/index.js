// Vercel Serverless Function Entry Point
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');

// Create Express app IMMEDIATELY
const app = express();

// CORS - simple configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token', 'x-stream', 'X-Stream', 'Accept', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));

// Root endpoint - responds IMMEDIATELY, no dependencies
app.get('/', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    message: 'Humsafer API Server',
    timestamp: new Date().toISOString(),
    service: 'Humsafer API'
  });
});

// Health check - responds IMMEDIATELY
app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API'
  });
});

// Lazy load modules only when API routes are hit
let modulesLoaded = false;
let modulesLoading = false;
let requireAuth, asyncHandler, ai, schedule, expense, razorpay, auth;
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
      } else {
        admin.initializeApp();
        firebaseInitialized = true;
      }
    }
  } catch (e) {
    console.error('[Firebase] Init error:', e.message);
  }
}

function loadModules() {
  if (modulesLoading || modulesLoaded) return;
  modulesLoading = true;
  
  try {
    initializeFirebase();
    const utils = require('../utils');
    requireAuth = utils.requireAuth;
    asyncHandler = utils.asyncHandler;
    ai = require('../ai');
    schedule = require('../schedule');
    expense = require('../expense');
    razorpay = require('../razorpay');
    auth = require('../auth');
    modulesLoaded = true;
    setupRoutes();
  } catch (error) {
    console.error('[Init] Module loading error:', error.message);
    modulesLoaded = false;
  } finally {
    modulesLoading = false;
  }
}

function setupRoutes() {
  if (!modulesLoaded || !requireAuth || !asyncHandler || !ai) return;
  
  const admin = require('firebase-admin');
  
  app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
    const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
    if (wantsStream) {
      return ai.processMessageStream(req, res);
    }
    return ai.processMessage(req, res);
  }));
  
  app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));
  
  if (schedule) {
    app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
    app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));
  }
  
  if (expense) {
    app.post('/expense/add', requireAuth, asyncHandler(expense.add));
    app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));
  }
  
  if (razorpay) {
    app.post('/razorpay/create-order', requireAuth, asyncHandler(razorpay.createOrder));
    app.post('/razorpay/verify-payment', requireAuth, asyncHandler(razorpay.verifyPayment));
  }
  
  app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
    const uid = req.userId;
    try {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const tier = userDoc.data()?.subscriptionTier || null;
      const status = userDoc.data()?.subscriptionStatus || null;
      return res.json({ tier, status });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to get subscription', detail: e.message });
    }
  }));
}

// Middleware to load modules on API requests
app.use((req, res, next) => {
  // Skip for health endpoints
  if (req.path === '/' || req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  // Load modules if needed (synchronous for this request)
  if (!modulesLoaded && !modulesLoading) {
    loadModules();
  }
  
  // If modules failed to load, return 503
  if (!modulesLoaded) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Backend modules are loading. Please try again.',
      modulesLoaded: false
    });
  }
  
  next();
});

// Fallback for API routes before modules load
app.post('/ai/process', (req, res) => {
  res.status(503).json({ 
    error: 'Service temporarily unavailable',
    message: 'Backend modules are loading. Please try again.',
    modulesLoaded: false
  });
});

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

// Export handler IMMEDIATELY - no blocking operations above this line
const handler = serverless(app);
module.exports = handler;
