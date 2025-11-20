require('dotenv').config();
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Set default environment to development
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Initialize Firebase Admin with your service account
// You can download it from Firebase Console > Project Settings > Service Accounts
let firebaseInitialized = false;
const fs = require('fs');

try {
  // Priority 1: Environment variable (for Vercel/Production)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[Firebase] Initializing from environment variable...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized from environment variable');
    firebaseInitialized = true;
  } 
  // Priority 2: Service account file (for local development)
  else if (fs.existsSync('./service-account-key.json')) {
    console.log('[Firebase] Initializing from service account file...');
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized with service account file');
    firebaseInitialized = true;
  } 
  // Priority 3: Default credentials (Google Cloud)
  else {
    console.log('[Firebase] Trying default credentials...');
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('✅ Firebase Admin initialized with default credentials');
    firebaseInitialized = true;
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization failed:', error.message);
  console.warn('⚠️ Server will start but API endpoints requiring auth will fail');
  console.warn('⚠️ Add FIREBASE_SERVICE_ACCOUNT environment variable to fix this');
  
  // Try to initialize without credentials (allows health check to work)
  try {
    admin.initializeApp();
    console.warn('⚠️ Firebase initialized without credentials - auth endpoints will not work');
  } catch (e) {
    // Already initialized or can't initialize
    console.warn('⚠️ Firebase could not initialize:', e.message);
  }
  
  firebaseInitialized = false;
}

console.log('[server] Environment:', process.env.NODE_ENV);
console.log('[server] Firebase:', firebaseInitialized ? '✅ Initialized' : '⚠️ Not initialized (dev mode)');
console.log('[server] Environment variables loaded:', {
  ALLOW_UNAUTHENTICATED: process.env.ALLOW_UNAUTHENTICATED,
  XAI_API_KEY: process.env.XAI_API_KEY ? '✅ SET (' + process.env.XAI_API_KEY.substring(0, 10) + '...)' : '❌ MISSING',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ SET (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : '❌ MISSING',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ? '✅ SET (' + process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...)' : '❌ MISSING',
});

// Import route handlers
const { requireAuth, asyncHandler } = require('./utils');
const ai = require('./ai');
const schedule = require('./schedule');
const expense = require('./expense');
// const mom = require('./mom'); // Commented out - file doesn't exist
const razorpay = require('./razorpay');
const auth = require('./auth');

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

// Enhanced CORS configuration for Flutter app
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token', 'x-stream', 'X-Stream', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    message: 'Humsafer API Server',
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    environment: process.env.NODE_ENV || 'production',
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
    environment: process.env.NODE_ENV || 'production'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Humsafer API',
    environment: process.env.NODE_ENV || 'production'
  });
});

// API routes (all require authentication)
app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
  const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
  if (wantsStream) {
    return ai.processMessageStream(req, res);
  }
  return ai.processMessage(req, res);
}));
app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));

// Schedule endpoints
app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));

// Expense endpoints
app.post('/expense/add', requireAuth, asyncHandler(expense.add));
app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));

// Mom/recording endpoints
// app.post('/mom/record', requireAuth, asyncHandler(mom.record)); // Commented out - mom module doesn't exist

// Auth endpoints
app.post('/auth/send-otp', requireAuth, asyncHandler(auth.sendOTP));
app.post('/auth/verify-otp', requireAuth, asyncHandler(auth.verifyOTP));

// Razorpay endpoints
app.post('/razorpay/create-order', requireAuth, asyncHandler(razorpay.createOrder));
app.post('/razorpay/verify-payment', requireAuth, asyncHandler(razorpay.verifyPayment));

// Subscription management
app.get('/subscription/me', requireAuth, asyncHandler(async (req, res) => {
  const uid = req.userId;
  const isDemo = uid === 'demo' || req.query.demo === 'true';
  
  // Demo mode - return mock subscription
  if (isDemo) {
    console.log('[Subscription] Demo mode - returning mock subscription');
    return res.json({ 
      tier: null, 
      status: 'free',
      demo: true
    });
  }
  
  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const tier = userDoc.data()?.subscriptionTier || null;
    const status = userDoc.data()?.subscriptionStatus || null;
    return res.json({ tier, status });
  } catch (e) {
    console.error('[Subscription] Firestore error:', e.message);
    return res.json({ tier: null, status: 'error', error: e.message });
  }
}));

// Usage quota endpoint
const { getRemainingQuota } = require('./usage-limits');
app.get('/usage/quota', requireAuth, asyncHandler(async (req, res) => {
  const uid = req.userId;
  const { tierLevel } = req.query;
  
  try {
    const quota = await getRemainingQuota(uid, tierLevel || 'free');
    console.log(`[Usage] Quota check for ${uid}:`, quota);
    return res.json(quota);
  } catch (e) {
    console.error('[Usage] Error getting quota:', e.message);
    return res.status(500).json({ error: 'Failed to get quota', detail: e.message });
  }
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Backend Server Started Successfully!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📍 Server running at: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug endpoint: http://localhost:${PORT}/debug/env`);
  console.log('');
  console.log('🔒 CORS Configuration:');
  console.log('   ✅ All origins allowed (development mode)');
  console.log('   ✅ Credentials enabled');
  console.log('   ✅ Methods: GET, POST, PUT, DELETE, OPTIONS');
  console.log('   ✅ Headers: Content-Type, Authorization, x-demo');
  console.log('');
  console.log('🔐 Authentication Mode:');
  if (firebaseInitialized) {
    console.log('   ✅ Firebase Admin: Properly initialized');
    console.log('   ✅ Token verification: ENABLED');
  } else {
    console.log('   ⚠️  Firebase Admin: Not initialized');
    console.log('   ⚠️  Token verification: BYPASSED (development only)');
    console.log('   ⚠️  Users can access with unverified tokens');
  }
  console.log('');
  console.log('📱 Flutter App Connection:');
  console.log('   Set useStandaloneServer = true in api_service.dart');
  console.log('   Base URL: http://localhost:5002');
  console.log('');
  console.log('👤 User Authentication:');
  console.log('   - Sign up/Login works without Firebase credentials');
  console.log('   - Tokens are accepted but not cryptographically verified');
  console.log('   - Demo mode: Add ?demo=true to any request');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});

// Export app for Vercel serverless deployment
module.exports = app;

// Graceful shutdown (only for local server)
if (require.main === module) {
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT signal received: closing HTTP server');
    process.exit(0);
  });
}

