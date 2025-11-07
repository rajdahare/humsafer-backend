const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const db = admin.firestore();

// Subscription plans in paise (1 INR = 100 paise)
const PLANS = {
  tier1: { name: 'Basic', amount: 100000 },      // Rs 1000
  tier2: { name: 'Premium', amount: 150000 },    // Rs 1500
  tier3: { name: 'Ultimate', amount: 200000 },   // Rs 2000
};

/**
 * Create Razorpay order for subscription
 */
async function createOrder(req, res) {
  const uid = req.userId;
  const { tier } = req.body || {};
  const isDemo = uid === 'demo' || req.query.demo === 'true';

  console.log('[Razorpay] Creating order for user:', uid, 'tier:', tier, 'demo:', isDemo);

  if (!tier || !PLANS[tier]) {
    console.error('[Razorpay] Invalid tier:', tier);
    return res.status(400).json({ error: 'Invalid tier. Must be tier1, tier2, or tier3' });
  }

  const plan = PLANS[tier];
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error('[Razorpay] API keys not configured');
    return res.status(500).json({ 
      error: 'Razorpay not configured',
      detail: 'Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env file'
    });
  }

  try {
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const receiptId = `${uid.substring(0, 10)}_${tier}_${Date.now()}`;
    
    // Create REAL Razorpay order (even in demo mode)
    // This is necessary for checkout page to validate the order ID
    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        userId: uid,
        tier: tier,
        planName: plan.name,
        demo: isDemo ? 'true' : 'false',  // Mark as demo in notes
      },
    });

    console.log('[Razorpay] Order created:', order.id, 'demo:', isDemo);

    // Store in Firestore only if not demo mode
    if (!isDemo) {
      try {
        await db.collection('razorpay_orders').doc(order.id).set({
          userId: uid,
          tier: tier,
          orderId: order.id,
          amount: plan.amount,
          currency: 'INR',
          status: 'created',
          createdAt: new Date().toISOString(),
        });
      } catch (firestoreError) {
        console.warn('[Razorpay] Firestore error (continuing):', firestoreError.message);
        // Continue even if Firestore fails
      }
    } else {
      console.log('[Razorpay] Demo mode - skipping Firestore save');
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: keyId,
      tier: tier,
      planName: plan.name,
      demo: isDemo,
    });
  } catch (e) {
    console.error('[Razorpay] Order creation error:', e.message);
    console.error('[Razorpay] Error stack:', e.stack);
    return res.status(500).json({ 
      error: 'Failed to create order',
      detail: e.message 
    });
  }
}

/**
 * Verify Razorpay payment
 */
async function verifyPayment(req, res) {
  const uid = req.userId;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier } = req.body || {};
  const isDemo = uid === 'demo' || req.query.demo === 'true' || razorpay_order_id?.startsWith('order_demo_');

  console.log('[Razorpay] Verifying payment for user:', uid, 'demo:', isDemo);
  console.log('[Razorpay] Order ID:', razorpay_order_id);
  console.log('[Razorpay] Payment ID:', razorpay_payment_id);

  // Demo mode or demo order - always verify successfully
  if (isDemo || razorpay_order_id?.startsWith('order_demo_')) {
    console.log('[Razorpay] Demo mode - auto-verifying payment');
    const demoTier = tier || 'tier1';
    return res.status(200).json({ 
      verified: true, 
      tier: demoTier,
      planName: PLANS[demoTier].name,
      demo: true
    });
  }

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: 'Razorpay secret not configured' });
  }

  try {
    // Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      console.error('[Razorpay] Invalid signature!');
      return res.status(400).json({ verified: false, error: 'Invalid signature' });
    }

    console.log('[Razorpay] Signature verified successfully');

    // Get order details
    let orderData = null;
    try {
      const orderDoc = await db.collection('razorpay_orders').doc(razorpay_order_id).get();
      if (orderDoc.exists) {
        orderData = orderDoc.data();
      }
    } catch (firestoreError) {
      console.warn('[Razorpay] Firestore read error:', firestoreError.message);
    }

    if (!orderData) {
      console.error('[Razorpay] Order not found:', razorpay_order_id);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('[Razorpay] Order tier:', orderData.tier);

    // Update order status
    try {
      await db.collection('razorpay_orders').doc(razorpay_order_id).update({
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: 'paid',
        paidAt: new Date().toISOString(),
      });

      // Update user subscription in Firestore
      await db.collection('users').doc(uid).set({
        subscriptionTier: orderData.tier,
        subscriptionStatus: 'active',
        subscriptionStart: new Date().toISOString(),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      }, { merge: true });

      // Save transaction history
      await db.collection('users').doc(uid).collection('transactions').add({
        userId: uid,
        type: 'subscription',
        status: 'completed',
        amount: orderData.amount / 100, // Convert paise to rupees
        currency: 'INR',
        tier: orderData.tier,
        planName: PLANS[orderData.tier].name,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        paymentMethod: 'Razorpay',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        description: `${PLANS[orderData.tier].name} Subscription - Monthly`,
      });
      
      console.log('[Razorpay] Transaction history saved');
    } catch (firestoreError) {
      console.warn('[Razorpay] Firestore update error (continuing):', firestoreError.message);
      // Continue even if Firestore fails
    }

    console.log('[Razorpay] User subscription updated to:', orderData.tier);

    return res.status(200).json({ 
      verified: true, 
      tier: orderData.tier,
      planName: PLANS[orderData.tier].name
    });
  } catch (e) {
    console.error('[Razorpay] Verification error:', e.message);
    return res.status(500).json({ error: 'Verification failed', detail: e.message });
  }
}

module.exports = { createOrder, verifyPayment };

