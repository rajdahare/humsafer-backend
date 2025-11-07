const admin = require('firebase-admin');
const twilio = require('twilio');

const db = admin.firestore();
let twilioClient = null;

// Initialize Twilio client if credentials are available
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendOTP(req, res) {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });

  if (!twilioClient) {
    // In demo/dev mode, allow verification without Twilio
    return res.json({ success: true, message: 'OTP sent (demo mode)' });
  }

  try {
    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phone, channel: 'sms' });

    return res.json({ success: true, sid: verification.sid });
  } catch (e) {
    console.error('Twilio OTP error:', e);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
}

async function verifyOTP(req, res) {
  const uid = req.userId;
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

  if (!twilioClient) {
    // In demo/dev mode, accept any 6-digit OTP
    if (otp.length === 6) {
      await db.collection('users').doc(uid).set({ ageVerified: true }, { merge: true });
      return res.json({ verified: true });
    }
    return res.json({ verified: false });
  }

  try {
    const verificationCheck = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code: otp });

    if (verificationCheck.status === 'approved') {
      await db.collection('users').doc(uid).set({ ageVerified: true }, { merge: true });
      return res.json({ verified: true });
    }

    return res.json({ verified: false });
  } catch (e) {
    console.error('Twilio verification error:', e);
    return res.status(500).json({ error: 'Verification failed' });
  }
}

module.exports = { sendOTP, verifyOTP };

