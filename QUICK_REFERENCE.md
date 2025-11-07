# Quick Reference Guide

## 🚀 Deploy to Vercel (5 Commands)

```bash
# 1. Prepare Firebase credentials
node prepare-env-for-vercel.js

# 2. Login to Vercel
vercel login

# 3. Initialize project
vercel

# 4. Add env vars in Vercel Dashboard
# (Go to vercel.com → Project → Settings → Environment Variables)

# 5. Deploy to production
vercel --prod
```

**Your backend will be live at:** `https://your-project.vercel.app`

---

## 📝 Required Environment Variables

Copy these to Vercel Dashboard:

```
NODE_ENV=production
FIREBASE_SERVICE_ACCOUNT={...from step 1...}
OPENAI_API_KEY=sk-...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
```

---

## 🔌 Connect Flutter App

In `ai_app/lib/services/api_service.dart`:

```dart
class ApiConfig {
  static String productionUrl = 'https://your-actual-url.vercel.app';
  static bool useProduction = true;  // ← Change this
}
```

---

## 🧪 Test Production

```bash
# Health check
curl https://your-project.vercel.app/health

# Should return: {"ok":true,...}
```

---

## 📖 Full Guides

- **Quick Deploy:** `README_VERCEL.md`
- **Detailed Steps:** `PRODUCTION_DEPLOYMENT.md`
- **Checklist:** `DEPLOYMENT_CHECKLIST.md`
- **Summary:** `PRODUCTION_READY_SUMMARY.md`

---

## 🆘 Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| Firebase not initialized | Check `FIREBASE_SERVICE_ACCOUNT` env var |
| API keys not found | Add all required env vars in Vercel |
| 401 errors | Verify Firebase token in request |
| CORS errors | Check CORS configuration |

---

## 🔄 Update Deployment

```bash
# After code changes
vercel --prod
```

---

## 📊 Monitor

- **Logs:** https://vercel.com/dashboard → Project → Deployments
- **Analytics:** Settings → Analytics
- **Functions:** Deployment → Functions tab

---

That's it! You're ready to deploy! 🎉

