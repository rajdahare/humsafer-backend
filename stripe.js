const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2024-06-20' });
const db = admin.firestore();

// Tier pricing in INR (will be converted to paise for Stripe)
const TIER_PRICES = {
  tier1: 100000, // ₹1000 = 100000 paise
  tier2: 150000, // ₹1500
  tier3: 200000, // ₹2000
};

async function createCheckoutSession(req, res) {
  const uid = req.userId;
  const { tier } = req.body || {};
  
  if (!tier || !TIER_PRICES[tier]) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    const priceInPaise = TIER_PRICES[tier];
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: `Humdam ${tier.toUpperCase()} Subscription`,
              description: 'Monthly subscription',
            },
            recurring: {
              interval: 'month',
            },
            unit_amount: priceInPaise,
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://humdam.app'}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://humdam.app'}/subscription-cancel`,
      client_reference_id: uid,
      metadata: {
        tier: tier,
        userId: uid,
      },
    });

    return res.json({ sessionId: session.id, url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

async function webhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid = session.client_reference_id;
        const tier = session.metadata?.tier || 'tier1';
        if (uid) {
          await db.collection('users').doc(uid).set({ 
            subscriptionTier: tier,
            subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const uid = subscription.metadata?.userId;
        if (uid) {
          await db.collection('users').doc(uid).update({ subscriptionTier: null });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('Stripe webhook handling error:', e);
    return res.status(500).send('Internal');
  }
  return res.status(200).send('ok');
}

module.exports = { createCheckoutSession, webhook };


