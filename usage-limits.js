const admin = require('firebase-admin');
const db = admin.firestore();

// Free tier limits (for all non-paying users)
const FREE_TIER_LIMITS = {
  durationDays: 7,        // FREE tier valid for 7 days only
  totalMessages: 50,      // Total messages allowed in free tier
  dailyMessages: 15,      // Max messages per day
  cooldownSeconds: 3,     // Seconds between messages
  rateLimit: 10,          // Max requests per minute
};

// Paid tier limits (unlimited for now, can be adjusted)
const PAID_TIER_LIMITS = {
  tier1: { totalMessages: -1, dailyMessages: -1 }, // Unlimited
  tier2: { totalMessages: -1, dailyMessages: -1 }, // Unlimited
  tier3: { totalMessages: -1, dailyMessages: -1 }, // Unlimited
};

/**
 * Get user's message usage statistics
 */
async function getUserUsage(uid) {
  try {
    const usageRef = db.collection('users').doc(uid).collection('usage').doc('messages');
    const doc = await usageRef.get();
    
    if (!doc.exists) {
      return {
        totalMessages: 0,
        todayMessages: 0,
        lastMessageAt: null,
        dailyResetAt: getNextDayStart(),
      };
    }
    
    const data = doc.data();
    const now = new Date();
    const dailyResetAt = data.dailyResetAt?.toDate() || getNextDayStart();
    
    // Reset daily count if it's a new day
    if (now >= dailyResetAt) {
      return {
        totalMessages: data.totalMessages || 0,
        todayMessages: 0,
        lastMessageAt: data.lastMessageAt?.toDate() || null,
        dailyResetAt: getNextDayStart(),
      };
    }
    
    return {
      totalMessages: data.totalMessages || 0,
      todayMessages: data.todayMessages || 0,
      lastMessageAt: data.lastMessageAt?.toDate() || null,
      dailyResetAt: dailyResetAt,
    };
  } catch (e) {
    console.error('[UsageLimits] Error getting usage:', e);
    return {
      totalMessages: 0,
      todayMessages: 0,
      lastMessageAt: null,
      dailyResetAt: getNextDayStart(),
    };
  }
}

/**
 * Check if FREE tier has expired (7 days from account creation)
 */
async function checkFreeTierExpiry(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return { expired: false }; // New user, not expired
    }
    
    const userData = userDoc.data();
    const createdAt = userData.createdAt?.toDate() || new Date();
    const now = new Date();
    const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreation > FREE_TIER_LIMITS.durationDays) {
      const daysExpired = Math.floor(daysSinceCreation - FREE_TIER_LIMITS.durationDays);
      return {
        expired: true,
        daysExpired: daysExpired,
        createdAt: createdAt,
      };
    }
    
    return { expired: false, createdAt: createdAt };
  } catch (e) {
    console.error('[UsageLimits] Error checking expiry:', e);
    return { expired: false }; // Don't block on error
  }
}

/**
 * Check if user can send a message (enforce limits)
 */
async function checkMessageLimit(uid, tierLevel) {
  const usage = await getUserUsage(uid);
  const now = new Date();
  
  // Paid subscribers (tier1, tier2, tier3) - unlimited
  if (tierLevel && tierLevel !== 'none' && tierLevel !== 'free' && tierLevel !== 'expired') {
    const tierLimit = PAID_TIER_LIMITS[tierLevel];
    if (tierLimit) {
      // Check tier-specific limits if any
      if (tierLimit.dailyMessages > 0 && usage.todayMessages >= tierLimit.dailyMessages) {
        return {
          allowed: false,
          usage,
          reason: `Daily limit reached (${tierLimit.dailyMessages} messages/day)`,
          remainingTotal: -1,
          remainingToday: 0,
        };
      }
      // Paid users are generally unlimited
      return { allowed: true, usage, reason: null };
    }
  }
  
  // Free tier users (default for all non-paying users) - enforce strict limits
  if (!tierLevel || tierLevel === 'none' || tierLevel === 'free' || tierLevel === 'expired') {
    // Check if FREE tier has expired (7 days)
    const expiryCheck = await checkFreeTierExpiry(uid);
    if (expiryCheck.expired) {
      return {
        allowed: false,
        usage,
        reason: `Your 7-day FREE tier has expired. Please upgrade to a paid plan to continue using AI features.`,
        remainingTotal: 0,
        remainingToday: 0,
        expired: true,
      };
    }
    // Check total message limit
    if (usage.totalMessages >= FREE_TIER_LIMITS.totalMessages) {
      return {
        allowed: false,
        usage,
        reason: `Free tier limit reached (${FREE_TIER_LIMITS.totalMessages} messages). Please upgrade to continue.`,
        remainingTotal: 0,
        remainingToday: Math.max(0, FREE_TIER_LIMITS.dailyMessages - usage.todayMessages),
      };
    }
    
    // Check daily message limit
    if (usage.todayMessages >= FREE_TIER_LIMITS.dailyMessages) {
      return {
        allowed: false,
        usage,
        reason: `Daily limit reached (${FREE_TIER_LIMITS.dailyMessages} messages/day). Try again tomorrow.`,
        remainingTotal: FREE_TIER_LIMITS.totalMessages - usage.totalMessages,
        remainingToday: 0,
      };
    }
    
    // Check cooldown period
    if (usage.lastMessageAt) {
      const timeSinceLastMessage = (now - usage.lastMessageAt) / 1000; // seconds
      if (timeSinceLastMessage < FREE_TIER_LIMITS.cooldownSeconds) {
        const waitTime = Math.ceil(FREE_TIER_LIMITS.cooldownSeconds - timeSinceLastMessage);
        return {
          allowed: false,
          usage,
          reason: `Please wait ${waitTime} seconds between messages.`,
          remainingTotal: FREE_TIER_LIMITS.totalMessages - usage.totalMessages,
          remainingToday: FREE_TIER_LIMITS.dailyMessages - usage.todayMessages,
        };
      }
    }
    
    // All checks passed - allow message
    return {
      allowed: true,
      usage,
      reason: null,
      remainingTotal: FREE_TIER_LIMITS.totalMessages - usage.totalMessages - 1,
      remainingToday: FREE_TIER_LIMITS.dailyMessages - usage.todayMessages - 1,
    };
  }
  
  // Should not reach here - default to free tier
  return checkMessageLimit(uid, 'free');
}

/**
 * Increment user's message count
 */
async function incrementMessageCount(uid) {
  try {
    const usage = await getUserUsage(uid);
    const usageRef = db.collection('users').doc(uid).collection('usage').doc('messages');
    
    // Initialize user document with createdAt if first message (for FREE tier expiry tracking)
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        tier: 'free',
        freeTierStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`[UsageLimits] Initialized user document for ${uid} with FREE tier`);
    }
    
    const now = new Date();
    const dailyResetAt = usage.dailyResetAt;
    
    // Reset daily count if it's a new day
    const todayMessages = now >= dailyResetAt ? 1 : usage.todayMessages + 1;
    const newDailyResetAt = now >= dailyResetAt ? getNextDayStart() : dailyResetAt;
    
    await usageRef.set({
      totalMessages: usage.totalMessages + 1,
      todayMessages: todayMessages,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      dailyResetAt: admin.firestore.Timestamp.fromDate(newDailyResetAt),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    return {
      totalMessages: usage.totalMessages + 1,
      todayMessages: todayMessages,
    };
  } catch (e) {
    console.error('[UsageLimits] Error incrementing count:', e);
    throw e;
  }
}

/**
 * Get start of next day (for daily reset)
 */
function getNextDayStart() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * Get user's remaining quota
 */
async function getRemainingQuota(uid, tierLevel) {
  const usage = await getUserUsage(uid);
  
  // Paid subscribers (tier1, tier2, tier3) - unlimited
  if (tierLevel && tierLevel !== 'none' && tierLevel !== 'free') {
    return {
      totalRemaining: -1,
      todayRemaining: -1,
      totalLimit: -1,
      dailyLimit: -1,
      unlimited: true,
    };
  }
  
  // Free tier users (default for all non-paying users)
  return {
    totalRemaining: Math.max(0, FREE_TIER_LIMITS.totalMessages - usage.totalMessages),
    todayRemaining: Math.max(0, FREE_TIER_LIMITS.dailyMessages - usage.todayMessages),
    totalLimit: FREE_TIER_LIMITS.totalMessages,
    dailyLimit: FREE_TIER_LIMITS.dailyMessages,
    unlimited: false,
    usage: usage,
  };
}

module.exports = {
  checkMessageLimit,
  incrementMessageCount,
  getUserUsage,
  getRemainingQuota,
  checkFreeTierExpiry,
  FREE_TIER_LIMITS,
};

