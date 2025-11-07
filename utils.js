const admin = require('firebase-admin');

console.log('[utils] Authentication module loaded');

async function verifyToken(req) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.substring(7) : null;
  if (!token) throw new Error('Missing Authorization header');
  
  try {
    // Try to verify token with Firebase
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    // Check if error is due to Firebase not being properly configured
    const errorMsg = e.message || '';
    const isConfigError = errorMsg.includes('project ID') || 
                          errorMsg.includes('credential') || 
                          errorMsg.includes('metadata.google.internal') ||
                          errorMsg.includes('ENOTFOUND') ||
                          errorMsg.includes('authentication');
    
    if (isConfigError && process.env.NODE_ENV !== 'production') {
      // In development, if Firebase isn't configured, treat as demo user
      // This allows testing without Firebase credentials
      console.warn('[utils] Firebase verification failed - treating as demo user in development mode');
      return 'demo'; // Return 'demo' so all endpoints use mock data
    }
    
    // Re-throw the error if it's a real token validation issue
    throw e;
  }
}

function requireAuth(req, res, next) {
  // Development mode - allow unauthenticated access
  if (
    process.env.ALLOW_UNAUTHENTICATED === 'true' ||
    req.query.demo === 'true' ||
    (req.headers['x-demo'] && String(req.headers['x-demo']).toLowerCase() === 'true')
  ) {
    req.userId = 'demo';
    return next();
  }
  
  // Verify token (will handle Firebase initialization issues automatically)
  verifyToken(req)
    .then((uid) => {
      req.userId = uid;
      next();
    })
    .catch((err) => res.status(401).json({ error: 'UNAUTHENTICATED', detail: err.message }));
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function ok(res, data) {
  res.status(200).json(data || { ok: true });
}

module.exports = { requireAuth, asyncHandler, ok };


