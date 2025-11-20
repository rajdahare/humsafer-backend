// Vercel Serverless Function Entry Point
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');

// Create Express app IMMEDIATELY - don't wait for anything
const app = express();

// Initialize Firebase Admin (only once) - non-blocking
let firebaseInitialized = false;
try {
  if (!admin.apps.length) {
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
  }
} catch (error) {
  console.warn('⚠️ Firebase initialization failed:', error.message);
}

// Import modules with error handling - load each module individually to prevent cascading failures
// Load modules lazily to avoid blocking handler export
let requireAuth, asyncHandler, ai, schedule, expense, razorpay, auth;
let modulesLoaded = false;
let modulesLoading = false;

// Lazy load modules - only load when first needed
function loadModules() {
  if (modulesLoading || modulesLoaded) return;
  modulesLoading = true;
  
  try {
    console.log('[Init] Loading utils...');
    const utils = require('../utils');
    requireAuth = utils.requireAuth;
    asyncHandler = utils.asyncHandler;
    console.log('[Init] ✅ Utils loaded');
  } catch (error) {
    console.error('❌ Error loading utils:', error.message);
  }

  try {
    console.log('[Init] Loading ai module...');
    ai = require('../ai');
    console.log('[Init] ✅ AI module loaded');
  } catch (error) {
    console.error('❌ Error loading ai module:', error.message);
    ai = null;
  }

  try {
    console.log('[Init] Loading other modules...');
    schedule = require('../schedule');
    expense = require('../expense');
    razorpay = require('../razorpay');
    auth = require('../auth');
    console.log('[Init] ✅ Optional modules loaded');
  } catch (error) {
    console.error('❌ Error loading optional modules:', error.message);
    schedule = null;
    expense = null;
    razorpay = null;
    auth = null;
  }

  modulesLoaded = !!(requireAuth && asyncHandler && ai);
  modulesLoading = false;
  
  if (modulesLoaded) {
    console.log('[Init] ✅ All critical modules loaded successfully');
    setupRoutes();
  } else {
    console.warn('⚠️ Some critical modules failed to load - API routes will be limited');
  }
}

// Setup routes after modules are loaded
function setupRoutes() {
  if (!modulesLoaded || !requireAuth || !asyncHandler || !ai) return;
  
  // Support streaming when client asks (X-Stream: 1 or body.stream === true)
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
  
  // Subscription management
  app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
    const uid = req.userId;
    try {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const tier = userDoc.data()?.subscriptionTier || null;
      const status = userDoc.data()?.subscriptionStatus || null;
      return res.json({ tier, status });
    } catch (e) {
      console.error('[Subscription] Error:', e.message);
      return res.status(500).json({ error: 'Failed to get subscription', detail: e.message });
    }
  }));
}

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

// Root endpoint - must respond immediately
app.get('/', (req, res) => {
  try {
    return res.status(200).json({ 
      ok: true, 
      message: 'Humsafer API Server',
      timestamp: new Date().toISOString(),
      service: 'Humsafer API',
      firebase: firebaseInitialized ? 'initialized' : 'not initialized',
      modulesLoaded: modulesLoaded,
      endpoints: {
        health: '/health',
        apiHealth: '/api/health'
      }
    });
  } catch (e) {
    console.error('[Root] Error:', e);
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
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

// Load modules immediately but don't block handler export
// Use setImmediate to defer heavy loading after handler is exported
setImmediate(() => {
  try {
    loadModules();
  } catch (e) {
    console.error('[Init] Error in deferred module loading:', e.message);
  }
});

// Middleware to handle API requests before modules are loaded
app.use((req, res, next) => {
  // Skip loading check for health/root endpoints - they work immediately
  if (req.path === '/' || req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  // If modules not loaded yet, try loading now (synchronous for this request)
  if (!modulesLoaded && !modulesLoading) {
    loadModules();
  }
  
  // If still not loaded, return 503 for API endpoints
  const isApiEndpoint = req.path.startsWith('/ai/') || 
                        req.path.startsWith('/schedule/') || 
                        req.path.startsWith('/expense/') || 
                        req.path.startsWith('/razorpay/') || 
                        req.path.startsWith('/subscription/') ||
                        req.path.startsWith('/voice/');
  
  if (!modulesLoaded && isApiEndpoint) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Backend modules are loading. Please try again in a moment.',
      modulesLoaded: false
    });
  }
  
  next();
});

// Add fallback route for API endpoints if modules not loaded
app.post('/ai/process', (req, res) => {
  if (!modulesLoaded) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Backend modules failed to load. Check server logs.',
      modulesLoaded: false
    });
  }
  // This route will be replaced by setupRoutes() when modules load
  res.status(503).json({ error: 'Modules not ready' });
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

// Wrap Express app with serverless-http
// This is required for Vercel serverless functions
let handler;
try {
  handler = serverless(app, {
    binary: ['image/*', 'application/pdf']
  });
  console.log('[Init] ✅ Serverless handler created successfully');
} catch (error) {
  console.error('❌ Error creating serverless handler:', error.message);
  console.error('❌ Handler error stack:', error.stack);
  // Create a minimal Express app as fallback
  const fallbackApp = express();
  fallbackApp.use(cors());
  fallbackApp.get('*', (req, res) => {
    res.status(500).json({ 
      error: 'Handler initialization failed',
      message: error.message 
    });
  });
  handler = serverless(fallbackApp);
}

// Export handler for Vercel - MUST always export something
// This ensures the function can be invoked even if there were initialization errors
module.exports = handler;

