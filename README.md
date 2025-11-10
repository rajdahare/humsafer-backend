# Humsafer Backend API

Backend API for Humsafer - Your AI companion mobile application.

## 🚀 Features

- AI-powered conversation (xAI Grok, OpenAI, Google AI)
- Voice intent processing with continuous mode
- Automatic contact calling (Siri-like)
- Fast response optimization for voice interactions
- Schedule management with Google Meet integration
- Auto-save calendar events
- Expense tracking
- Payment processing (Razorpay)
- Firebase Authentication
- User subscription management with usage quotas

## 📋 Prerequisites

- Node.js 20.x or higher
- Firebase project with Admin SDK credentials
- At least one AI API key (xAI, OpenAI, or Google AI)
- Razorpay account for payment processing

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/rajdahare/humsafer-backend.git
cd humsafer-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Add your Firebase service account key:
   - Download from Firebase Console > Project Settings > Service Accounts
   - Save as `service-account-key.json` in the project root

5. Configure environment variables in `.env`:
   - Add your AI API keys
   - Add Razorpay credentials
   - Configure other settings as needed

## 🏃 Running Locally

```bash
npm start
```

Server will start on http://localhost:5002

## 📦 Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel --prod
```

3. Set environment variables in Vercel dashboard:
   - Go to your project settings
   - Add all variables from `.env.example`
   - Add Firebase service account as environment variable

### Environment Variables for Vercel

Required environment variables:
- `XAI_API_KEY` or `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- Firebase credentials (as JSON string or individual variables)

## 📡 API Endpoints

### Public
- `GET /health` - Health check

### Authentication Required
- `POST /ai/process` - Process AI messages
- `POST /voice/intent` - Process voice commands
- `POST /schedule/add` - Add schedule item
- `GET /schedule/list` - Get user schedules
- `POST /expense/add` - Add expense
- `GET /report/monthly` - Get monthly expense report
- `POST /razorpay/create-order` - Create payment order
- `POST /razorpay/verify-payment` - Verify payment
- `GET /subscription/me` - Get user subscription

## 🔐 Security

- All API endpoints (except `/health`) require Firebase Authentication
- CORS enabled for cross-origin requests
- Environment variables for sensitive data
- Firebase Admin SDK for secure database access

## 📝 License

Private - All rights reserved

## 👨‍💻 Author

Humsafer Team
