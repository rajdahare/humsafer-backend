# Demo Mode Fix - Firebase Firestore Error

## Problem
When testing subscription features from the Flutter app, the following error occurred:
```
POST http://localhost:5002/razorpay/create-order?demo=true 500 (Internal Server Error)
Error: "Unable to detect a Project Id in the current environment"
```

**Root Cause:** The backend server was trying to access Firebase Firestore even in demo mode, but Firebase Admin SDK wasn't properly initialized because no service account credentials were provided.

---

## Solution
Added **demo mode support** to all endpoints that interact with Firestore. When demo mode is active, endpoints return mock data instead of accessing Firestore.

---

## Changes Made

### 1. **razorpay.js** - Payment Endpoints
- ✅ `createOrder()` - Returns mock Razorpay order in demo mode
- ✅ `verifyPayment()` - Auto-verifies payments in demo mode
- ✅ Wrapped Firestore operations in try-catch blocks for non-demo mode

### 2. **schedule.js** - Schedule Management
- ✅ `add()` - Returns mock schedule items in demo mode
- ✅ `list()` - Returns mock schedule list in demo mode
- ✅ Added error handling for Firestore operations

### 3. **expense.js** - Expense Tracking
- ✅ `add()` - Returns mock expense in demo mode
- ✅ `monthly()` - Returns mock monthly report in demo mode
- ✅ Added error handling for Firestore operations

### 4. **server.js** - Subscription Endpoint
- ✅ `GET /subscription/me` - Returns mock subscription status in demo mode
- ✅ Added error handling for Firestore operations

---

## How Demo Mode Works

Demo mode is activated when **any** of these conditions are met:
1. `userId === 'demo'` (set by `requireAuth` middleware)
2. Query parameter: `?demo=true`
3. Header: `x-demo: true`

### Example Requests:

#### Create Razorpay Order (Demo Mode)
```bash
POST http://localhost:5002/razorpay/create-order?demo=true
Content-Type: application/json
x-demo: true

{
  "tier": "tier1"
}
```

**Response:**
```json
{
  "orderId": "order_demo_1762509737604",
  "amount": 100000,
  "currency": "INR",
  "keyId": "rzp_test_demo",
  "tier": "tier1",
  "planName": "Basic",
  "demo": true
}
```

#### Add Schedule (Demo Mode)
```bash
POST http://localhost:5002/schedule/add?demo=true
Content-Type: application/json

{
  "title": "Team Meeting",
  "datetime": "2025-11-07T15:00:00Z",
  "note": "Discuss project updates"
}
```

**Response:**
```json
{
  "ok": true,
  "id": "demo_1762509800000",
  "title": "Team Meeting",
  "time": "2025-11-07T15:00:00Z",
  "details": "Discuss project updates",
  "demo": true
}
```

#### Add Expense (Demo Mode)
```bash
POST http://localhost:5002/expense/add?demo=true
Content-Type: application/json

{
  "amount": 500,
  "category": "food",
  "note": "Lunch"
}
```

**Response:**
```json
{
  "ok": true,
  "id": "demo_1762509900000",
  "amount": 500,
  "category": "food",
  "note": "Lunch",
  "demo": true
}
```

---

## Testing the Fix

### 1. Test Health Endpoint
```bash
curl http://localhost:5002/health
```

### 2. Test Razorpay Order Creation
```powershell
$body = @{tier='tier1'} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:5002/razorpay/create-order?demo=true' `
  -Method POST -Body $body -ContentType 'application/json' `
  -Headers @{'x-demo'='true'}
```

### 3. Test from Flutter App
The Flutter app automatically sends `?demo=true` when:
- User is not authenticated
- App is in debug mode (`kDebugMode`)

---

## Production Configuration

For production with real Firebase:

### 1. **Initialize Firebase Admin Properly**

Create a service account key:
1. Go to Firebase Console
2. Project Settings > Service Accounts
3. Click "Generate new private key"
4. Save as `service-account-key.json`

Update `server.js`:
```javascript
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

### 2. **Environment Variable Alternative**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### 3. **Disable Demo Mode in Production**
In `utils.js`, remove or comment out:
```javascript
if (process.env.ALLOW_UNAUTHENTICATED === 'true' || 
    req.query.demo === 'true' || 
    req.headers['x-demo'] === 'true') {
  req.userId = 'demo';
  return next();
}
```

---

## Demo vs Production Comparison

| Feature | Demo Mode | Production Mode |
|---------|-----------|-----------------|
| Authentication | Optional (bypassed) | Required (Firebase ID token) |
| Firestore Access | Skipped (returns mocks) | Full access with credentials |
| Razorpay Orders | Mock orders | Real Razorpay API calls |
| Payment Verification | Auto-verified | Real signature verification |
| Data Persistence | None (in-memory mocks) | Stored in Firestore |
| Error Handling | Returns mocks on error | Returns proper error messages |

---

## Benefits of Demo Mode

1. ✅ **No Firebase Setup Required** - Test without credentials
2. ✅ **Fast Development** - No network calls to external services
3. ✅ **Predictable Responses** - Consistent mock data for testing
4. ✅ **No Cost** - No Firebase or payment gateway charges
5. ✅ **Easy Testing** - Test UI/UX without backend setup

---

## Current Server Status

✅ Server running on: http://localhost:5002
✅ Demo mode enabled
✅ All endpoints tested and working
✅ CORS configured properly
✅ Ready for Flutter app connection

---

## Next Steps

1. ✅ **Fixed** - Razorpay endpoint now works in demo mode
2. ✅ **Fixed** - All Firestore-dependent endpoints handle demo mode
3. 📱 **Ready** - Flutter app can now test subscription features
4. 🎯 **Test** - Try upgrading plan from Flutter app

Run your Flutter app and test the subscription upgrade. It should now work without Firebase errors!

---

**Status:** ✅ Issue Resolved
**Testing:** ✅ All endpoints tested successfully
**Demo Mode:** ✅ Active and working

