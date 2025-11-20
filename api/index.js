// Vercel Serverless Function Entry Point
// Use Vercel's native handler for better performance

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-demo,firebase-auth-token,x-stream,X-Stream');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Root endpoint - responds IMMEDIATELY
  if (req.url === '/' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'Humsafer API Server',
      timestamp: new Date().toISOString(),
      service: 'Humsafer API'
    });
  }
  
  // Health endpoints - respond IMMEDIATELY
  if (req.url === '/health' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      service: 'Humsafer API'
    });
  }
  
  if (req.url === '/api/health' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      service: 'Humsafer API'
    });
  }
  
  // For all other routes, use Express (lazy load)
  // This ensures root/health endpoints work even if Express fails to load
  try {
    // Lazy load Express and modules only when needed
    const express = require('express');
    const serverless = require('serverless-http');
    
    // Create app if not already created
    if (!global.__app) {
      global.__app = express();
      global.__app.use(express.json({ limit: '10mb' }));
      
      // CORS middleware
      global.__app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-demo,firebase-auth-token,x-stream,X-Stream');
        if (req.method === 'OPTIONS') {
          return res.sendStatus(200);
        }
        next();
      });
      
      // Lazy load and setup routes
      let modulesLoaded = false;
      
      function loadModules() {
        if (modulesLoaded) return;
        
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
          
          global.__app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
            const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
            if (wantsStream) {
              return ai.processMessageStream(req, res);
            }
            return ai.processMessage(req, res);
          }));
          
          global.__app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));
          
          const schedule = require('../schedule');
          const expense = require('../expense');
          const razorpay = require('../razorpay');
          
          global.__app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
          global.__app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));
          global.__app.post('/expense/add', requireAuth, asyncHandler(expense.add));
          global.__app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));
          global.__app.post('/razorpay/create-order', requireAuth, asyncHandler(razorpay.createOrder));
          global.__app.post('/razorpay/verify-payment', requireAuth, asyncHandler(razorpay.verifyPayment));
          
          global.__app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
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
          
          global.__app.use((req, res) => {
            res.status(404).json({ error: 'Not Found', path: req.path });
          });
          
          global.__app.use((err, req, res, next) => {
            console.error('Error:', err);
            res.status(err.status || 500).json({
              error: err.message || 'Internal Server Error'
            });
          });
          
          modulesLoaded = true;
        } catch (error) {
          console.error('[Init] Module loading error:', error.message);
        }
      }
      
      // Load modules on first API request
      loadModules();
    }
    
    // Use serverless-http to handle Express app
    if (!global.__handler) {
      global.__handler = serverless(global.__app);
    }
    
    // Delegate to Express handler
    return global.__handler(req, res);
    
  } catch (error) {
    console.error('[Handler] Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};
