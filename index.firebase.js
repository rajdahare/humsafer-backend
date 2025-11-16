require('dotenv').config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Admin BEFORE requiring modules that use Firestore
admin.initializeApp();
console.log('[functions] env loaded', {
  ALLOW_UNAUTHENTICATED: process.env.ALLOW_UNAUTHENTICATED,
  XAI_API_KEY: process.env.XAI_API_KEY ? 'set (' + process.env.XAI_API_KEY.substring(0, 10) + '...)' : '❌ MISSING',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : 'unset',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ? 'set (' + process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...)' : 'unset',
});

const { requireAuth, asyncHandler } = require('./utils');
const ai = require('./ai');
const schedule = require('./schedule');
const expense = require('./expense');
const mom = require('./mom');
const razorpay = require('./razorpay');
const auth = require('./auth');

const app = express();

// CORS Configuration for Production (Vercel)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Allow all origins in production (adjust if you want specific origins)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo', 'firebase-auth-token', 'x-stream', 'X-Stream', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes
app.use(express.json({ limit: '10mb' }));

// Health check endpoint (public)
app.get('/health', (req, res) => res.status(200).json({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  service: 'Humsafer API'
}));

// API routes (all require authentication)
app.post('/ai/process', requireAuth, asyncHandler(async (req, res) => {
  const wantsStream = req.headers['x-stream'] === '1' || req.body?.stream === true;
  if (wantsStream) {
    return ai.processMessageStream(req, res);
  }
  return ai.processMessage(req, res);
}));
app.post('/schedule/add', requireAuth, asyncHandler(schedule.add));
app.get('/schedule/list', requireAuth, asyncHandler(schedule.list));
app.post('/expense/add', requireAuth, asyncHandler(expense.add));
app.get('/report/monthly', requireAuth, asyncHandler(expense.monthly));
app.post('/mom/record', requireAuth, asyncHandler(mom.record));
app.post('/voice/intent', requireAuth, asyncHandler(ai.voiceIntent));

// Auth endpoints
app.post('/auth/send-otp', requireAuth, asyncHandler(auth.sendOTP));
app.post('/auth/verify-otp', requireAuth, asyncHandler(auth.verifyOTP));

// Razorpay endpoints (simplified)
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

exports.api = functions.runWith({ memory: '512MB', timeoutSeconds: 120 }).https.onRequest(app);

// Scheduled: delete adult chat logs > 24h
exports.cleanupAdultLogs = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const snap = await db.collectionGroup('ai_logs').where('mode', '==', 'night').where('createdAt', '<', cutoff).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return null;
  });

// Daily report summary push (00:00)
exports.dailyExpenseReport = functions
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .pubsub.schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const db = admin.firestore();
    const users = await db.collection('users').get();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    for (const doc of users.docs) {
      try {
        const uid = doc.id;
        const totals = await expense.computeMonthly(uid, year, month);
        const payload = {
          notification: {
            title: 'Monthly Expense Report',
            body: `Personal: ₹${totals.personal.toFixed(2)}, Company: ₹${totals.company.toFixed(2)}, Total: ₹${totals.total.toFixed(2)}`,
          },
          data: { type: 'monthly_report' },
        };
        await admin.messaging().sendToTopic(`user_${uid}`, payload);
      } catch (_) {}
    }
    return null;
  });


