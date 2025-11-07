const admin = require('firebase-admin');
const { ok } = require('./utils');
const db = admin.firestore();

async function add(req, res) {
  const uid = req.userId;
  const { amount, category, note, imageUrl } = req.body || {};
  const isDemo = uid === 'demo' || req.query.demo === 'true';
  
  if (amount == null || !category) return res.status(400).json({ error: 'amount and category required' });
  
  // Demo mode - return mock response
  if (isDemo) {
    console.log('[Expense] Demo mode - returning mock expense');
    return ok(res, { 
      id: `demo_${Date.now()}`,
      amount: Number(amount),
      category,
      note,
      demo: true
    });
  }
  
  try {
    const doc = await db.collection('users').doc(uid).collection('expenses').add({
      amount: Number(amount),
      category,
      note: note || null,
      imageUrl: imageUrl || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
    });
    return ok(res, { id: doc.id });
  } catch (e) {
    console.error('[Expense] Firestore error:', e.message);
    return res.status(500).json({ error: 'Failed to save expense', detail: e.message });
  }
}

async function computeMonthly(uid, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('expenses')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(end))
    .get();
  let personal = 0,
    company = 0;
  for (const d of snap.docs) {
    const e = d.data();
    if (e.category === 'company') company += Number(e.amount || 0);
    else personal += Number(e.amount || 0);
  }
  return { personal, company, total: personal + company };
}

async function monthly(req, res) {
  const uid = req.userId;
  const { year, month } = req.query || {};
  const isDemo = uid === 'demo' || req.query.demo === 'true';
  
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  
  // Demo mode - return mock totals
  if (isDemo) {
    console.log('[Expense] Demo mode - returning mock monthly report');
    return ok(res, {
      personal: 15000,
      company: 25000,
      total: 40000,
      demo: true
    });
  }
  
  try {
    const totals = await computeMonthly(uid, y, m);
    return ok(res, totals);
  } catch (e) {
    console.error('[Expense] Firestore error:', e.message);
    return res.status(500).json({ error: 'Failed to fetch monthly report', detail: e.message });
  }
}

module.exports = { add, monthly, computeMonthly };


