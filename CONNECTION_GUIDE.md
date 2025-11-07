# Frontend-Backend Connection Guide

## ✅ Setup Complete!

Your standalone backend server is now running with proper CORS configuration and is ready to accept requests from the Flutter app.

---

## 🚀 Current Configuration

### Backend Server
- **URL:** `http://localhost:5002`
- **Status:** ✅ Running
- **CORS:** ✅ Configured
- **Environment:** Development

### CORS Settings
```javascript
{
  origin: true,              // Allows all origins (development)
  credentials: true,         // Allows cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo'],
  maxAge: 86400             // Cache preflight for 24 hours
}
```

### Flutter App Configuration
- **File:** `ai_app/lib/services/api_service.dart`
- **Setting:** `useStandaloneServer = true`
- **Base URL:** `http://localhost:5002`

---

## 📋 Available Endpoints

### Public Endpoints (No Auth Required)
- `GET /health` - Health check
- `GET /debug/env` - Check API keys configuration

### AI Endpoints
- `POST /ai/process` - Process chat messages
  ```json
  {
    "message": "Hello!",
    "mode": "funLearn",
    "conversationHistory": []
  }
  ```
- `POST /voice/intent` - Process voice commands

### Schedule Endpoints
- `POST /schedule/add` - Add schedule items
  ```json
  {
    "title": "Meeting",
    "datetime": "2025-11-07T10:00:00Z",
    "note": "Optional note"
  }
  ```
- `GET /schedule/list` - List all schedules

### Expense Endpoints
- `POST /expense/add` - Add expense
  ```json
  {
    "amount": 100,
    "category": "food",
    "note": "Lunch",
    "imageUrl": "optional"
  }
  ```
- `GET /report/monthly?year=2025&month=11` - Monthly report

### Auth Endpoints
- `POST /auth/send-otp` - Send OTP for verification
- `POST /auth/verify-otp` - Verify OTP

### Payment Endpoints
- `POST /razorpay/create-order` - Create payment order
- `POST /razorpay/verify-payment` - Verify payment

### Subscription
- `GET /subscription/me` - Get user subscription status

---

## 🔐 Authentication

Most endpoints require Firebase authentication. Include the Firebase ID token in the request header:

```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

### Demo Mode (Development Only)
For testing without authentication, add `x-demo: true` header or `?demo=true` query parameter.

---

## 🧪 Testing the Connection

### 1. Test from Command Line
```bash
# Windows PowerShell
curl http://localhost:5002/health

# Or using Invoke-RestMethod
Invoke-RestMethod -Uri http://localhost:5002/health
```

### 2. Test CORS Configuration
```bash
node test-cors.js
```

### 3. Test from Flutter App
```dart
import 'package:your_app/services/api_service.dart';

// Make sure useStandaloneServer = true in ApiConfig
final response = await ApiService.get('/health');
print(response); // Should print: {ok: true, timestamp: ...}
```

---

## 🔧 Environment Variables

Required environment variables (create `.env` file in `ai_app_backend/`):

```env
# AI Providers (at least one required)
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
GOOGLE_AI_API_KEY=...

# Payments
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
STRIPE_SECRET=...

# Authentication
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...

# Optional
ALLOW_UNAUTHENTICATED=true  # For testing without auth
NODE_ENV=development
PORT=5002
```

### Current API Keys Status:
- ✅ XAI_API_KEY - Configured
- ✅ OPENAI_API_KEY - Configured
- ❌ GOOGLE_AI_API_KEY - Not configured
- ✅ RAZORPAY_KEY_ID - Configured

---

## 🎯 Running the Server

### Start Server
```bash
cd ai_app_backend
node server.js
```

### Stop Server
```powershell
# Windows PowerShell
Get-Process node | Stop-Process -Force
```

### Auto-restart on Code Changes (Optional)
```bash
npm install -g nodemon
nodemon server.js
```

---

## 📱 Flutter App Setup

### 1. Update API Configuration
In `ai_app/lib/services/api_service.dart`:
```dart
class ApiConfig {
  static bool useStandaloneServer = true;  // ✅ Already set!
  // ...
}
```

### 2. Run Flutter App
```bash
cd ai_app
flutter pub get
flutter run
```

### 3. Switch to Firebase Functions (Production)
Set `useStandaloneServer = false` in `api_service.dart`

---

## 🔍 Troubleshooting

### Issue: CORS Error
**Solution:** Make sure the backend server is running and CORS is configured (already done).

### Issue: Connection Refused
**Solution:** 
- Check if server is running: `curl http://localhost:5002/health`
- Check if port 5002 is available
- Try a different port: Set `PORT=5003` in `.env`

### Issue: Authentication Failed
**Solution:**
- Make sure Firebase is initialized in Flutter app
- Get fresh Firebase ID token
- For testing, use demo mode: `?demo=true`

### Issue: API Returns Empty Response
**Solution:**
- Check API keys in `.env` file
- Run `node server.js` to see error logs
- Check `/debug/env` endpoint to verify API keys

---

## 📊 Server Logs

The server logs all requests:
```
[2025-11-07T09:34:14.505Z] GET /health
[2025-11-07T09:34:15.123Z] POST /ai/process
```

Monitor the console where you started `node server.js` to see real-time requests.

---

## 🚀 Next Steps

1. ✅ Backend server is running
2. ✅ CORS is configured
3. ✅ Flutter app is configured to use standalone server
4. 🎯 **Test the connection from Flutter app:**
   - Run the Flutter app
   - Try sending a chat message
   - Check backend logs for incoming requests

5. 📝 **Add your API keys** if not already set:
   - Create `.env` file in `ai_app_backend/`
   - Add required API keys (see Environment Variables section)

---

## 📞 Support

If you encounter issues:
1. Check server logs in the terminal where you ran `node server.js`
2. Run CORS tests: `node test-cors.js`
3. Check API keys: Visit `http://localhost:5002/debug/env`
4. Verify Flutter configuration: Check `useStandaloneServer` flag

---

**Happy Coding! 🎉**

