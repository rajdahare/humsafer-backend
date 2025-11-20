// Vercel Serverless Function Entry Point
// CRITICAL: Export handler IMMEDIATELY - no blocking operations before this

let handler;
let app;

try {
  // Create minimal Express app
  const express = require('express');
  app = express();
  
  // Simple CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-demo,firebase-auth-token,x-stream,X-Stream');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  app.use(express.json({ limit: '10mb' }));
  
  // Root endpoint - MUST respond instantly
  app.get('/', (req, res) => {
    res.status(200).json({ 
      ok: true, 
      message: 'Humsafer API Server',
      timestamp: new Date().toISOString(),
      service: 'Humsafer API'
    });
  });
  
  // Health endpoints
  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString(), service: 'Humsafer API' });
  });
  
  app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString(), service: 'Humsafer API' });
  });
  
  // Lazy load modules only when needed
  let modulesLoaded = false;
  let modulesLoading = false;
  
  function loadModules() {
    if (modulesLoading || modulesLoaded) return;
    modulesLoading = true;
    
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else if (!admin.apps.length) {
        admin.initializeApp();
      }
      
      const utils = require('../utils');
      const requireAuth = utils.requireAuth;
      const asyncHandler = utils.asyncHandler;
      const ai = require('../ai');
      
      // Setup API routes
      app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
        const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
        if (wantsStream) {
          return ai.processMessageStream(req, res);
        }
        return ai.processMessage(req, res);
      }));
      
      app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));
      
      const schedule = require('../schedule');
      const expense = require('../expense');
      const razorpay = require('../razorpay');
      
      app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
      app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));
      app.post('/expense/add', requireAuth, asyncHandler(expense.add));
      app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));
      app.post('/razorpay/create-order', requireAuth, asyncHandler(razorpay.createOrder));
      app.post('/razorpay/verify-payment', requireAuth, asyncHandler(razorpay.verifyPayment));
      
      app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
        const uid = req.userId;
        try {
          const userDoc = await admin.firestore().collection('users').doc(uid).get();
          return res.json({ 
            tier: userDoc.data()?.subscriptionTier || null, 
            status: userDoc.data()?.subscriptionStatus || null 
          });
        } catch (e) {
          return res.status(500).json({ error: 'Failed to get subscription', detail: e.message });
        }
      }));
      
      modulesLoaded = true;
    } catch (error) {
      console.error('[Init] Module loading error:', error.message);
      modulesLoaded = false;
    } finally {
      modulesLoading = false;
    }
  }
  
  // Middleware to load modules on API requests (skip for root/health)
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/health' || req.path === '/api/health') {
      return next();
    }
    
    if (!modulesLoaded && !modulesLoading) {
      loadModules();
    }
    
    if (!modulesLoaded) {
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        message: 'Backend modules are loading. Please try again.',
        modulesLoaded: false
      });
    }
    
    next();
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
  
  // Wrap with serverless-http
  const serverless = require('serverless-http');
  handler = serverless(app);
  
} catch (error) {
  console.error('[Init] Critical error:', error);
  // Fallback handler
  const serverless = require('serverless-http');
  const express = require('express');
  const fallbackApp = express();
  fallbackApp.get('*', (req, res) => {
    res.status(500).json({ error: 'Initialization failed', message: error.message });
  });
  handler = serverless(fallbackApp);
}

// Export handler - MUST be at the end, no code after this
module.exports = handler;
