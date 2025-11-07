# Humdam / SoulSync – Firebase Functions

## Setup
1) Node 20 and Firebase CLI installed; login:
```bash
firebase login
```
2) Install deps:
```bash
cd functions
npm i
```
3) Set config (recommended: use `firebase functions:config:set` or a secrets manager). For local dev, export env vars:
- OPENAI_API_KEY
- XAI_API_KEY
- STRIPE_SECRET
- STRIPE_WEBHOOK_SECRET
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID

## Deploy
```bash
npm run deploy
```

## Endpoints (all under /api)
- POST /ai/process { message, mode }
- POST /voice/intent { command }
- POST /schedule/add { title, datetime, note? }
- GET  /schedule/list
- POST /expense/add { amount, category, note?, imageUrl? }
- GET  /report/monthly?year=&month=
- POST /mom/record { audioUrl }
- POST /stripe/webhook (no auth)

## Scheduled jobs
- cleanupAdultLogs: hourly delete adult logs >24h
- dailyExpenseReport: daily 00:00 IST sends monthly totals via FCM
