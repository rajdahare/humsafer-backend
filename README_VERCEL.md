# Quick Start: Deploy to Vercel

This guide will help you deploy the backend to Vercel in 10 minutes.

---

## Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

---

## Step 2: Prepare Environment Variables

### A. Generate Firebase Environment Variable

```bash
node prepare-env-for-vercel.js
```

This will create a minified JSON string of your Firebase service account.
**Copy the output** - you'll paste it into Vercel.

### B. Get Your API Keys

Gather these from your accounts:
- OpenAI: https://platform.openai.com/api-keys
- X.AI/Grok: https://console.x.ai/
- Razorpay: https://dashboard.razorpay.com/app/keys

---

## Step 3: Deploy to Vercel

```bash
cd ai_app_backend
vercel login
vercel
```

Follow the prompts:
- **Set up and deploy?** Y
- **Which scope?** Select your account
- **Link to existing project?** N
- **Project name?** `humsafer-backend`
- **Directory?** `./`
- **Override settings?** N

**You'll get a URL like:** `https://humsafer-backend-abc123.vercel.app`

---

## Step 4: Add Environment Variables in Vercel

1. Go to: https://vercel.com/dashboard
2. Click your project: `humsafer-backend`
3. Go to: **Settings** → **Environment Variables**

Add these variables:

### Required Variables

| Name | Value | Where to Get |
|------|-------|--------------|
| `NODE_ENV` | `production` | Just type it |
| `FIREBASE_SERVICE_ACCOUNT` | `{...}` | From Step 2A output |
| `OPENAI_API_KEY` | `sk-...` | https://platform.openai.com/api-keys |
| `RAZORPAY_KEY_ID` | `rzp_test_...` or `rzp_live_...` | https://dashboard.razorpay.com/app/keys |
| `RAZORPAY_KEY_SECRET` | Secret key | Same as above |

### Optional Variables

| Name | Value | Where to Get |
|------|-------|--------------|
| `XAI_API_KEY` | `xai-...` | https://console.x.ai/ |
| `GOOGLE_AI_API_KEY` | `...` | https://makersuite.google.com/app/apikey |
| `STRIPE_SECRET_KEY` | `sk_test_...` | https://dashboard.stripe.com/apikeys |

---

## Step 5: Deploy to Production

```bash
vercel --prod
```

**Your production URL:** `https://humsafer-backend.vercel.app`

---

## Step 6: Test Your Deployment

```bash
# Test health endpoint
curl https://humsafer-backend.vercel.app/health

# Should return:
# {"ok":true,"timestamp":"...","environment":"production"}
```

---

## Step 7: Connect Flutter App

Edit `ai_app/lib/services/api_service.dart`:

```dart
class ApiConfig {
  static bool useProduction = true;
  
  static String get baseUrl {
    if (useProduction || kReleaseMode) {
      return 'https://humsafer-backend.vercel.app'; // ← Your Vercel URL
    }
    return 'http://localhost:5002'; // Local dev
  }
}
```

---

## Step 8: Test from Flutter App

```dart
// In your Flutter app
final response = await ApiService.get('/health');
print(response); // Should work!
```

---

## Troubleshooting

### Issue: "Firebase not initialized"
**Fix:** Check `FIREBASE_SERVICE_ACCOUNT` is set correctly in Vercel

### Issue: "API keys not found"
**Fix:** Verify all required environment variables are added

### Issue: CORS errors
**Fix:** Your app domain is automatically allowed (origin: true)

---

## Update Deployment

When you make changes:

```bash
git add .
git commit -m "Update backend"
git push

# Or manually:
vercel --prod
```

---

## Monitor Your Deployment

- **Logs:** https://vercel.com/dashboard → Your Project → Deployments
- **Analytics:** Settings → Analytics (enable if needed)
- **Errors:** Function → Logs tab

---

## Cost

Vercel Free Tier includes:
- ✅ 100 GB bandwidth/month
- ✅ 100 GB-hours execution/month
- ✅ Unlimited API requests
- ✅ Automatic HTTPS
- ✅ Global CDN

**Perfect for startups!** 🚀

---

## Quick Commands Reference

```bash
# Deploy
vercel --prod

# Check deployments
vercel ls

# View logs
vercel logs [deployment-url]

# Rollback
vercel rollback [deployment-url]

# Add environment variable
vercel env add VARIABLE_NAME
```

---

## Need Help?

- **Vercel Docs:** https://vercel.com/docs
- **Deployment Guide:** See `PRODUCTION_DEPLOYMENT.md`
- **Checklist:** See `DEPLOYMENT_CHECKLIST.md`

---

**That's it! Your backend is now live on Vercel! 🎉**

Production URL: `https://humsafer-backend.vercel.app`

