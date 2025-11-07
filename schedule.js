const admin = require('firebase-admin');
const { ok } = require('./utils');
const db = admin.firestore();

async function add(req, res) {
  const uid = req.userId;
  const { text, title, datetime, note } = req.body || {};
  const isDemo = uid === 'demo' || req.query.demo === 'true';
  
  // If natural language text is provided, parse it
  if (text && !title && !datetime) {
    try {
      // Simple natural language parsing
      const parsed = parseNaturalLanguage(text);
      
      // Demo mode - return mock response
      if (isDemo) {
        console.log('[Schedule] Demo mode - returning mock schedule');
        return ok(res, { 
          id: `demo_${Date.now()}`, 
          title: parsed.title, 
          time: parsed.datetime,
          details: parsed.note,
          demo: true
        });
      }
      
      const doc = await db.collection('users').doc(uid).collection('schedule').add({
        title: parsed.title,
        datetime: parsed.datetime,
        note: parsed.note || null,
        createdAt: new Date(),
      });
      return ok(res, { 
        id: doc.id, 
        title: parsed.title, 
        time: parsed.datetime,
        details: parsed.note 
      });
    } catch (e) {
      console.error('Error parsing natural language:', e);
      return res.status(400).json({ error: 'Could not parse event details', detail: e.message });
    }
  }
  
  // Otherwise, require title and datetime
  if (!title || !datetime) {
    return res.status(400).json({ error: 'title and datetime required (or provide "text" for natural language)' });
  }
  
  // Demo mode - return mock response
  if (isDemo) {
    console.log('[Schedule] Demo mode - returning mock schedule');
    return ok(res, { 
      id: `demo_${Date.now()}`, 
      title, 
      time: datetime, 
      details: note,
      demo: true
    });
  }
  
  try {
    const doc = await db.collection('users').doc(uid).collection('schedule').add({
      title,
      datetime,
      note: note || null,
      createdAt: new Date(),
    });
    return ok(res, { id: doc.id, title, time: datetime, details: note });
  } catch (e) {
    console.error('[Schedule] Firestore error:', e.message);
    return res.status(500).json({ error: 'Failed to save schedule', detail: e.message });
  }
}

// Simple natural language parser for scheduling
function parseNaturalLanguage(text) {
  console.log('[Schedule] Parsing natural language:', text);
  
  const lowerText = text.toLowerCase();
  let title = text;
  let datetime = new Date();
  let note = null;
  
  // Extract time
  const timePatterns = [
    /at (\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
    /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2})\s*baje/i, // Hindi: "6 baje"
  ];
  
  let hour = datetime.getHours();
  let minute = 0;
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      hour = parseInt(match[1]);
      minute = match[2] ? parseInt(match[2]) : 0;
      
      // Handle AM/PM
      if (match[3]) {
        const meridiem = match[3].toLowerCase();
        if (meridiem === 'pm' && hour < 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
      } else if (hour >= 1 && hour <= 7) {
        // Indian context: assume evening for 1-7
        hour += 12;
      }
      break;
    }
  }
  
  // Extract date
  const today = new Date();
  let targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, 0, 0);
  
  if (lowerText.includes('tomorrow') || lowerText.includes('kal')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lowerText.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  } else if (lowerText.match(/next (\w+)/)) {
    // Next Monday, etc.
    const dayMatch = lowerText.match(/next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(dayMatch[1].toLowerCase());
      const currentDay = today.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      targetDate.setDate(targetDate.getDate() + daysToAdd);
    }
  }
  
  // Validate the date
  if (isNaN(targetDate.getTime())) {
    console.error('[Schedule] Invalid date created');
    targetDate = new Date(); // Fallback to now
  }
  
  datetime = targetDate.toISOString();
  
  // Extract title (remove time and date references)
  title = text
    .replace(/at \d{1,2}:?\d{0,2}\s*(am|pm)?/gi, '')
    .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
    .replace(/\d{1,2}\s*(am|pm|baje)/gi, '')
    .replace(/tomorrow|kal|today|aaj/gi, '')
    .replace(/next \w+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If title is too short, use original text
  if (title.length < 3) {
    title = text.substring(0, 100);
  }
  
  // Extract person name (with/ke sath)
  const personMatch = text.match(/(with|ke sath)\s+(\w+)/i);
  if (personMatch) {
    note = `With ${personMatch[2]}`;
  }
  
  // Extract topic
  const topicMatch = text.match(/(topic|vishay)\s+(\w+)/i);
  if (topicMatch) {
    note = note ? `${note}, Topic: ${topicMatch[2]}` : `Topic: ${topicMatch[2]}`;
  }
  
  console.log('[Schedule] Parsed:', { title, datetime, note });
  
  return { title, datetime, note };
}

async function list(req, res) {
  const uid = req.userId;
  const isDemo = uid === 'demo' || req.query.demo === 'true';
  
  // Demo mode - return mock schedules
  if (isDemo) {
    console.log('[Schedule] Demo mode - returning mock schedule list');
    const mockSchedules = [
      {
        id: 'demo_1',
        title: 'Team Meeting',
        datetime: new Date(Date.now() + 3600000).toISOString(),
        note: 'Discuss project updates',
        createdAt: new Date()
      },
      {
        id: 'demo_2',
        title: 'Doctor Appointment',
        datetime: new Date(Date.now() + 86400000).toISOString(),
        note: 'Health checkup',
        createdAt: new Date()
      }
    ];
    return ok(res, mockSchedules);
  }
  
  try {
    const snap = await db.collection('users').doc(uid).collection('schedule').orderBy('datetime', 'asc').get();
    const out = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return ok(res, out);
  } catch (e) {
    console.error('[Schedule] Firestore error:', e.message);
    return res.status(500).json({ error: 'Failed to fetch schedules', detail: e.message });
  }
}

module.exports = { add, list };


