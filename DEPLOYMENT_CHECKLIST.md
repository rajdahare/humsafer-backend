# Deployment Checklist

## Pre-Deployment

### 1. Environment Setup
- [ ] All environment variables configured
- [ ] Firebase service account key obtained
- [ ] API keys tested (OpenAI, X.AI, or Google)
- [ ] Razorpay keys configured (test or live)
- [ ] `.env.example` file updated with all variables

### 2. Code Quality
- [ ] All features tested locally
- [ ] No console errors in local testing
- [ ] Authentication working properly
- [ ] Payment flow tested end-to-end
- [ ] AI responses working
- [ ] Schedule/expense features working

### 3. Security Review
- [ ] `NODE_ENV=production` will be set
- [ ] Firebase token verification enabled in production
- [ ] CORS configured with proper origins
- [ ] Sensitive data not in code (use env vars)
- [ ] Rate limiting considered
- [ ] Debug endpoints secured or removed

### 4. Firebase Configuration
- [ ] Firebase project created
- [ ] Service account key downloaded
- [ ] Firestore database created
- [ ] Firebase Authentication enabled
- [ ] Firestore security rules configured

---

## Vercel Deployment

### 1. Initial Setup
- [ ] Vercel account created
- [ ] Vercel CLI installed: `npm install -g vercel`
- [ ] Logged in: `vercel login`

### 2. Project Configuration
- [ ] `vercel.json` file created
- [ ] `.gitignore` file configured
- [ ] `package.json` scripts added

### 3. Environment Variables in Vercel
Set these in Vercel Dashboard → Settings → Environment Variables:

#### Required Variables
- [ ] `NODE_ENV` = `production`
- [ ] `FIREBASE_SERVICE_ACCOUNT` = `{...}` (JSON as single line)
- [ ] `OPENAI_API_KEY` or `XAI_API_KEY` or `GOOGLE_AI_API_KEY`
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`

#### Optional Variables
- [ ] `STRIPE_SECRET_KEY`
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_VERIFY_SERVICE_SID`

### 4. Deploy
```bash
cd ai_app_backend
vercel --prod
```

- [ ] Deployment successful
- [ ] Production URL obtained
- [ ] Health endpoint responds: `/health`
- [ ] Debug endpoint checked (if enabled): `/debug/env`

---

## Post-Deployment Testing

### 1. Basic Health Check
```bash
curl https://your-project.vercel.app/health
```
- [ ] Returns 200 OK
- [ ] Shows `"environment": "production"`

### 2. Authentication Test
- [ ] Get Firebase token from Flutter app
- [ ] Test protected endpoint
- [ ] Verify 401 for invalid/missing tokens
- [ ] Verify 200 for valid tokens

### 3. API Endpoint Tests
- [ ] `/subscription/me` - Get subscription status
- [ ] `/razorpay/create-order` - Create payment order
- [ ] `/schedule/add` - Add schedule item
- [ ] `/expense/add` - Add expense
- [ ] `/ai/process` - AI message processing

### 4. Payment Flow Test
- [ ] Create Razorpay order
- [ ] Open checkout page
- [ ] Complete test payment
- [ ] Verify payment callback
- [ ] Check subscription update

---

## Flutter App Configuration

### 1. Update API Service
In `ai_app/lib/services/api_service.dart`:

```dart
class ApiConfig {
  static bool useProduction = true; // Change to true
  static String productionUrl = 'https://your-project.vercel.app';
  
  static String get baseUrl {
    if (kReleaseMode || useProduction) {
      return productionUrl;
    }
    return 'http://localhost:5002'; // Local development
  }
}
```

- [ ] Production URL updated
- [ ] `useProduction` flag set correctly

### 2. Test from Flutter App
- [ ] Health check works
- [ ] Sign up/Login works
- [ ] AI chat works
- [ ] Schedule features work
- [ ] Expense tracking works
- [ ] Payment flow works
- [ ] Subscription updates work

---

## Monitoring & Maintenance

### 1. Set Up Monitoring
- [ ] Vercel Analytics enabled
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Set up email alerts for errors
- [ ] Monitor API usage and costs

### 2. Performance
- [ ] Check response times
- [ ] Verify function execution times
- [ ] Monitor bandwidth usage
- [ ] Optimize if needed

### 3. Logs
- [ ] Check Vercel function logs
- [ ] Review error logs
- [ ] Set up log aggregation (optional)

---

## Production Readiness Score

Count your checkmarks:
- [ ] 40+ items checked = ✅ **Ready for Production**
- [ ] 30-39 items checked = ⚠️ **Almost Ready** - Review missing items
- [ ] <30 items checked = ❌ **Not Ready** - Complete more items

---

## Rollback Plan

If issues occur in production:

### Quick Rollback
```bash
vercel ls  # List deployments
vercel rollback [previous-deployment-url]
```

### Emergency Actions
1. [ ] Document the issue
2. [ ] Check Vercel logs
3. [ ] Rollback to previous version
4. [ ] Fix issue locally
5. [ ] Test thoroughly
6. [ ] Re-deploy

---

## Support Contacts

- **Vercel Support:** https://vercel.com/support
- **Firebase Support:** https://firebase.google.com/support
- **Razorpay Support:** https://razorpay.com/support

---

## Notes

### Deployment Date
- Date: _______________
- Deployed by: _______________
- Production URL: _______________
- Version: _______________

### Issues Encountered
- 
- 
- 

### Resolutions
- 
- 
- 

---

**Good luck with your deployment! 🚀**

