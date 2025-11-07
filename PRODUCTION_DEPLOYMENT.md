# Production Deployment Guide - Vercel

Complete guide to deploy the Humdam/SoulSync backend to Vercel and connect it with your Flutter app.

---

## Prerequisites

✅ **Required:**
- Vercel account (free tier works)
- Firebase project with service account key
- At least one AI API key (OpenAI, X.AI, or Google)
- Razorpay account with API keys

✅ **Optional:**
- Stripe account (for global payments)
- Twilio account (for OTP verification)

---

## Part 1: Prepare Backend for Production

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Update package.json

Add deployment scripts:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "NODE_ENV=development node server.js",
    "deploy": "vercel --prod"
  }
}
```

### 3. Configure Environment Variables

Create `.env.production` file locally (for reference, don't commit):

```bash
# Copy from .env.example
cp .env.example .env.production

# Edit with production values
nano .env.production
```

**Production Environment Variables:**
```env
NODE_ENV=production

# Firebase - Add service account as JSON string or use Vercel secrets
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# AI Keys (at least one required)
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
GOOGLE_AI_API_KEY=...

# Razorpay Production Keys
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...

# Optional services
STRIPE_SECRET_KEY=sk_live_...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

---

## Part 2: Deploy to Vercel

### Step 1: Login to Vercel

```bash
cd ai_app_backend
vercel login
```

### Step 2: Initialize Project

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- Project name? `humsafer-backend` (or your choice)
- Directory? `./` (current directory)
- Override settings? **N**

### Step 3: Configure Environment Variables in Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - `NODE_ENV` = `production`
   - `OPENAI_API_KEY` = `sk-...`
   - `XAI_API_KEY` = `xai-...`
   - `RAZORPAY_KEY_ID` = `rzp_live_...`
   - `RAZORPAY_KEY_SECRET` = `...`
   - etc.

**For Firebase Service Account:**
1. Copy entire `service-account-key.json` content
2. Minify it to single line: https://codebeautify.org/jsonminifier
3. Add as `FIREBASE_SERVICE_ACCOUNT` variable

#### Option B: Via CLI

```bash
# Add environment variables one by one
vercel env add OPENAI_API_KEY
# Paste value when prompted

vercel env add XAI_API_KEY
vercel env add RAZORPAY_KEY_ID
vercel env add RAZORPAY_KEY_SECRET
# ... repeat for all variables
```

### Step 4: Update server.js for Firebase Credentials

The backend should detect the JSON string and parse it:

```javascript
// In server.js - already handled in your code
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else if (fs.existsSync('./service-account-key.json')) {
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error('Firebase initialization failed:', error);
}
```

### Step 5: Deploy to Production

```bash
vercel --prod
```

**You'll get a production URL:**
```
✅ Production: https://humsafer-backend.vercel.app
```

---

## Part 3: Test Production Deployment

### 1. Test Health Endpoint

```bash
curl https://humsafer-backend.vercel.app/health
```

Expected response:
```json
{
  "ok": true,
  "timestamp": "2025-11-07T10:30:00.000Z",
  "environment": "production"
}
```

### 2. Test Debug Endpoint (Verify Keys)

```bash
curl https://humsafer-backend.vercel.app/debug/env
```

Should show your API keys are configured (first few characters only).

### 3. Test Protected Endpoint

```bash
# Get Firebase token from Flutter app
# Then test:
curl -X GET https://humsafer-backend.vercel.app/subscription/me \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

---

## Part 4: Connect Flutter App to Production

### 1. Update API Configuration

Edit `ai_app/lib/services/api_service.dart`:

```dart
class ApiConfig {
  static String projectId = 'pa-app-fa5b7';
  
  // Toggle between local and production
  static bool useStandaloneServer = false; // Set to false for production
  static bool useProduction = true; // Set to true for production
  
  static String get baseUrl {
    // Production deployment
    if (kReleaseMode || useProduction) {
      return 'https://humsafer-backend.vercel.app'; // Your Vercel URL
    }
    
    // Local development
    if (kDebugMode && useStandaloneServer) {
      return 'http://localhost:5002';
    }
    
    // Firebase Functions (alternative)
    return 'https://us-central1-$projectId.cloudfunctions.net/api';
  }
}
```

### 2. Update CORS Configuration (Backend)

Ensure your Flutter app domain is allowed:

```javascript
// In server.js
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-flutter-app.com', 'https://your-app-domain.com']
    : true, // Allow all in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo'],
};
```

### 3. Test from Flutter App

```dart
// Test API connection
final response = await ApiService.get('/health');
print(response); // Should print: {ok: true, ...}
```

---

## Part 5: Production Checklist

### Security

- ✅ Remove or secure `/debug/env` endpoint
- ✅ Use production API keys (not test keys)
- ✅ Enable Firebase token verification
- ✅ Set proper CORS origins
- ✅ Remove `ALLOW_UNAUTHENTICATED` environment variable
- ✅ Use HTTPS only
- ✅ Add rate limiting (consider Vercel Edge Config)

### Environment

- ✅ `NODE_ENV=production`
- ✅ Firebase service account configured
- ✅ All required API keys set
- ✅ Razorpay live keys (not test)
- ✅ Proper error logging

### Testing

- ✅ Health endpoint responds
- ✅ Authentication works with real tokens
- ✅ Payment flow works end-to-end
- ✅ AI endpoints respond correctly
- ✅ Firestore operations work
- ✅ Schedule/expense features work

### Monitoring

- ✅ Enable Vercel Analytics
- ✅ Set up error tracking (Sentry, etc.)
- ✅ Monitor API usage
- ✅ Set up alerts for errors

---

## Part 6: Securing Production Endpoints

### Option 1: Remove Debug Endpoint

In `server.js`, comment out or remove:

```javascript
// Remove in production
// app.get('/debug/env', (req, res) => { ... });
```

### Option 2: Protect Debug Endpoint

```javascript
app.get('/debug/env', (req, res) => {
  // Only allow in development or with secret
  if (process.env.NODE_ENV !== 'production' || 
      req.headers['x-debug-secret'] === process.env.DEBUG_SECRET) {
    res.json({
      // ... debug info
    });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});
```

---

## Part 7: Continuous Deployment

### Auto-Deploy on Git Push

1. **Connect GitHub to Vercel:**
   - Go to Vercel Dashboard
   - Settings → Git
   - Connect your repository

2. **Push to Deploy:**
```bash
git add .
git commit -m "Production ready"
git push origin main
```

Vercel automatically deploys on push to main branch.

### Deployment Branches

- `main` → Production deployment
- `develop` → Preview deployment (staging)

---

## Part 8: Cost Optimization

### Vercel Free Tier Limits

- **Bandwidth:** 100 GB/month
- **Execution:** 100 GB-hours/month
- **Functions:** 100,000 invocations/month

### Optimize for Free Tier

1. **Enable Caching:**
```javascript
// Cache static responses
res.set('Cache-Control', 'public, max-age=300');
```

2. **Optimize Function Size:**
   - Keep dependencies minimal
   - Use tree-shaking
   - Avoid large packages

3. **Use Edge Functions (Optional):**
   - Faster response times
   - Better for global users

---

## Troubleshooting

### Issue: "Firebase not initialized"

**Solution:** Check `FIREBASE_SERVICE_ACCOUNT` environment variable
```bash
vercel env ls
# Verify FIREBASE_SERVICE_ACCOUNT is set
```

### Issue: "API keys not found"

**Solution:** Verify all environment variables are set in Vercel dashboard

### Issue: CORS errors

**Solution:** Update CORS configuration to include your app's domain

### Issue: 401 Unauthorized in production

**Solution:** Ensure Firebase token verification is working
- Check Firebase service account is correct
- Verify tokens from Flutter app are valid
- Check token expiration

---

## Production URLs

After deployment, you'll have:

```
Production: https://humsafer-backend.vercel.app
Preview: https://humsafer-backend-git-develop.vercel.app
```

### API Endpoints

```
GET  /health
GET  /subscription/me
POST /ai/process
POST /razorpay/create-order
POST /razorpay/verify-payment
POST /schedule/add
GET  /schedule/list
POST /expense/add
GET  /report/monthly
```

---

## Rollback Procedure

If something goes wrong:

```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]
```

---

## Next Steps

1. ✅ Deploy to Vercel
2. ✅ Test all endpoints
3. ✅ Update Flutter app configuration
4. ✅ Test from Flutter app
5. ✅ Monitor for errors
6. ✅ Set up analytics
7. ✅ Plan for scaling

---

## Support

- **Vercel Docs:** https://vercel.com/docs
- **Firebase Admin:** https://firebase.google.com/docs/admin/setup
- **Razorpay API:** https://razorpay.com/docs/api

---

## Summary

```bash
# Quick deployment
cd ai_app_backend
vercel login
vercel
# Add environment variables in dashboard
vercel --prod

# Get production URL
# Update Flutter app API configuration
# Test and deploy!
```

**Your backend will be live at: `https://your-project.vercel.app`** 🚀

