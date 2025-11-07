const admin = require('firebase-admin');
const { OpenAI } = require('openai');
// Node 20+ has native fetch, no need for node-fetch
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ok } = require('./utils');

const db = admin.firestore();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const genAI = GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(GOOGLE_AI_API_KEY) : null;

async function callOpenAI(prompt) {
  if (process.env.MOCK_AI === 'true') {
    return `Mock response: ${prompt.slice(0, 60)}...`;
  }
  if (!openai) {
    console.error('OpenAI: Client not initialized - check OPENAI_API_KEY');
    return '';
  }
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });
    return resp.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('OpenAI API error:', e.message || e);
    const msg = e?.message || '';
    if (msg.includes('429') || msg.includes('quota')) {
      console.error('❌ OpenAI: Rate limited or insufficient quota');
    }
    // Return empty string so it falls back to other AIs or shows proper error
    return '';
  }
}

async function callGrok(prompt, conversationHistory = []) {
  const apiKey = process.env.XAI_API_KEY;
  
  console.log('🔍 [Grok] API Key check:', apiKey ? `SET (${apiKey.substring(0, 10)}...)` : '❌ NOT SET');
  
  if (!apiKey) {
    console.error('❌ [Grok] XAI_API_KEY not found in environment!');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('API')));
    return '';
  }
  
  try {
    console.log('📝 [Grok] Building messages...');
    // Build messages array from conversation history
    let messages = [];
    
    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      console.log(`📚 [Grok] Using ${conversationHistory.length} history messages`);
      messages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } else {
      // If no history, just add the current prompt
      console.log('💬 [Grok] No history, using prompt directly');
      messages = [{ role: 'user', content: prompt }];
    }
    
    console.log('🚀 [Grok] Calling API with model: grok-2-1212');
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        Authorization: `Bearer ${apiKey}` 
      },
      body: JSON.stringify({ 
        model: 'grok-2-1212', 
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });
    
    console.log(`📡 [Grok] Response: ${resp.status} ${resp.statusText}`);
    
    if (!resp.ok) {
      console.error(`❌ [Grok] API error: ${resp.status} ${resp.statusText}`);
      const errorText = await resp.text();
      console.error('[Grok] Error body:', errorText);
      return '';
    }
    
    const data = await resp.json();
    const result = data.choices?.[0]?.message?.content || '';
    console.log(`✅ [Grok] Success! Response length: ${result.length} chars`);
    return result;
  } catch (e) {
    console.error('❌ [Grok] Exception:', e.message || e);
    console.error('[Grok] Full error:', JSON.stringify(e, null, 2));
    return '';
  }
}

async function callGemini(prompt, modelName = 'gemini-1.5-flash') {
  if (process.env.MOCK_AI === 'true') {
    return `Mock (Gemini) response: ${prompt.slice(0, 60)}...`;
  }
  if (!genAI) {
    console.error('Gemini: genAI not initialized - check GOOGLE_AI_API_KEY');
    console.error('GOOGLE_AI_API_KEY value:', process.env.GOOGLE_AI_API_KEY ? 'SET (length: ' + process.env.GOOGLE_AI_API_KEY.length + ')' : 'NOT SET');
    return '';
  }
  try {
    console.log('[Gemini] Calling with model:', modelName);
    console.log('[Gemini] Prompt length:', prompt.length);
    
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log('[Gemini] Response length:', text?.length || 0);
    return text || '';
  } catch (e) {
    console.error('Gemini API error:', e.message || e);
    console.error('Gemini error details:', e);
    
    // Try with alternative model
    if (modelName !== 'gemini-pro') {
      console.log('[Gemini] Trying fallback model: gemini-pro');
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        console.log('[Gemini] Fallback success, response length:', text?.length || 0);
        return text || '';
      } catch (fallbackError) {
        console.error('Gemini fallback also failed:', fallbackError.message);
      }
    }
    return '';
  }
}

// Helper function to parse expense requests
async function handleExpenseIntent(req, res, message, tier) {
  const uid = req.userId;
  
  try {
    // Extract amount
    const amountMatch = message.match(/(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[1]) : 0;
    
    // Determine category
    let category = 'personal';
    if (message.toLowerCase().includes('company') || message.toLowerCase().includes('work') || message.toLowerCase().includes('office')) {
      category = 'company';
    }
    
    // Extract note
    let note = message;
    
    // Add expense
    const expenseRef = await db.collection('users').doc(uid).collection('expenses').add({
      amount: amount,
      category: category,
      note: note,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const response = `Got it! I've added an expense of Rs ${amount} under ${category} category. Your expense has been tracked.`;
    
    // Log the action
    await db.collection('users').doc(uid).collection('ai_logs').add({
      text: message,
      response: response,
      action: 'expense.add',
      expenseId: expenseRef.id,
      mode: req.body.mode || 'general',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return ok(res, { response, action: 'expense.add', expenseId: expenseRef.id });
  } catch (e) {
    console.error('[handleExpenseIntent] Error:', e);
    // Fallback to regular AI response if expense tracking fails
    const fallbackResponse = 'I understand you want to track an expense. Could you please use the Expense tab to add it manually?';
    return ok(res, { response: fallbackResponse });
  }
}

// Helper function to parse scheduling requests
async function handleSchedulingIntent(req, res, message, tier) {
  const uid = req.userId;
  
  try {
    // Use AI to extract schedule details
    const extractionPrompt = `Extract the following from this scheduling request: "${message}"
    
Return ONLY a JSON object with these fields:
{
  "title": "brief title for the event",
  "datetime": "ISO 8601 datetime string",
  "note": "any additional details"
}

If you can't determine exact time, use next available hour. If date is relative (today, tomorrow), calculate actual date.
Today is ${new Date().toISOString()}.`;

    let extractedData = null;
    
    // Try to extract using available AI
    if (GOOGLE_AI_API_KEY) {
      const aiResponse = await callGemini(extractionPrompt);
      try {
        extractedData = JSON.parse(aiResponse);
      } catch (e) {
        // If JSON parsing fails, try to extract manually
        console.log('[Scheduling] AI response parsing failed, using fallback');
      }
    }
    
    // Fallback: Simple parsing (supports Hindi + English)
    if (!extractedData) {
      const now = new Date();
      let scheduledTime = new Date();
      
      // Extract time - supports multiple formats
      // "6 baje", "6pm", "18:00", "6 o'clock"
      let timeMatch = message.match(/(\d{1,2})\s*(baje|bje)/i); // Hindi: 6 baje
      if (!timeMatch) {
        timeMatch = message.match(/(\d{1,2})\s*(pm|am)/i); // English: 6pm
      }
      if (!timeMatch) {
        timeMatch = message.match(/(\d{1,2}):(\d{2})/); // 18:00
      }
      if (!timeMatch) {
        timeMatch = message.match(/(\d{1,2})\s*(o'clock|बजे)/i); // 6 o'clock
      }
      
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        // For "baje/bje" in Hindi, assume evening if > 12 is needed
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'pm' && hour < 12) {
          hour += 12;
        }
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        // If time is 1-7, assume evening (Indian context)
        if (hour >= 1 && hour <= 7 && !timeMatch[2]) {
          hour += 12;
        }
        scheduledTime.setHours(hour, timeMatch[3] ? parseInt(timeMatch[3]) : 0, 0, 0);
      }
      
      // Check for "today", "tomorrow", "aaj", "kal"
      const lower = message.toLowerCase();
      if (lower.includes('tomorrow') || lower.includes('kal')) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      // If no date mentioned, assume today
      
      // Extract title/topic - look for "topic", "vishay", names, etc.
      let title = 'Meeting';
      let person = null;
      
      // Extract person name (before "ke sath", "with")
      const personMatch = message.match(/(\w+)\s*(ke sath|with)/i);
      if (personMatch) {
        person = personMatch[1];
        title = `Meeting with ${person}`;
      }
      
      // Extract topic - supports "topic gd", "topic gd rakhna", "vishay xyz"
      const topicMatch = message.match(/topic\s+(\w+)|vishay\s+(\w+)|विषय\s+(\w+)/i);
      if (topicMatch) {
        const topic = (topicMatch[1] || topicMatch[2] || topicMatch[3]).toUpperCase();
        if (person) {
          title = `${person} - ${topic}`;
        } else {
          title = `${topic} Meeting`;
        }
      }
      
      // Specific keywords
      if (lower.includes('team')) title = 'Team Meeting';
      if (lower.includes('project')) title = 'Project Meeting';
      if (lower.includes('call')) title = 'Call';
      if (lower.includes('doctor')) title = 'Doctor Appointment';
      
      extractedData = {
        title: title,
        datetime: scheduledTime.toISOString(),
        note: message,
      };
    }
    
    // Add to schedule
    const scheduleRef = await db.collection('users').doc(uid).collection('schedule').add({
      title: extractedData.title,
      datetime: extractedData.datetime,
      note: extractedData.note || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Format response
    const scheduleTime = new Date(extractedData.datetime);
    const timeStr = scheduleTime.toLocaleTimeString('en-IN', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    const dateStr = scheduleTime.toLocaleDateString('en-IN', { 
      month: 'long', 
      day: 'numeric' 
    });
    
    const response = `Done! I've added "${extractedData.title}" to your calendar for ${dateStr} at ${timeStr}. You'll get a reminder notification before the event.`;
    
    // Log the action
    await db.collection('users').doc(uid).collection('ai_logs').add({
      text: message,
      response: response,
      action: 'schedule.add',
      scheduleId: scheduleRef.id,
      mode: req.body.mode || 'general',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return ok(res, { response, action: 'schedule.add', scheduleId: scheduleRef.id });
  } catch (e) {
    console.error('[handleSchedulingIntent] Error:', e);
    // Fallback to regular AI response
    return processMessage(req, res);
  }
}

async function processMessage(req, res) {
  const uid = req.userId;
  const { message, mode, conversationHistory, tierLevel } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const tier = tierLevel || 'tier1';
  const hasGrokKey = !!process.env.XAI_API_KEY;
  const hasOpenAIKey = !!OPENAI_API_KEY;
  
  console.log(`[processMessage] tier: ${tier}, mode: ${mode}, hasGrokKey: ${hasGrokKey}, hasOpenAIKey: ${hasOpenAIKey}`);

  // Check for scheduling intent (supports English + Hindi/Hinglish)
  const lowerMessage = message.toLowerCase();
  
  // Keywords for scheduling (English + Hindi)
  const scheduleKeywords = ['add', 'create', 'schedule', 'krdo', 'karna', 'lagao', 'set'];
  const scheduleTargets = ['meeting', 'reminder', 'calendar', 'calender', 'event', 'appointment', 'मीटिंग'];
  
  const hasScheduleAction = scheduleKeywords.some(kw => lowerMessage.includes(kw));
  const hasScheduleTarget = scheduleTargets.some(kw => lowerMessage.includes(kw));
  
  if (hasScheduleAction && hasScheduleTarget) {
    console.log('[AI] Scheduling intent detected!');
    return await handleSchedulingIntent(req, res, message, tier);
  }
  
  // Check for expense tracking intent (English + Hindi)
  const expenseKeywords = ['spent', 'expense', 'paid', 'bought', 'kharch', 'kharcha', 'दिया'];
  const hasExpenseKeyword = expenseKeywords.some(kw => lowerMessage.includes(kw));
  const amountMatch = message.match(/(\d+)/);
  
  if (hasExpenseKeyword && amountMatch) {
    console.log('[AI] Expense intent detected!');
    return await handleExpenseIntent(req, res, message, tier);
  }

  let result = '';
  try {
    // Prepare conversation history for context
    // LIMIT history to prevent stack overflow (keep only last 20 messages)
    let history = conversationHistory || [];
    if (history.length > 20) {
      console.log(`[processMessage] Trimming history from ${history.length} to 20 messages`);
      history = history.slice(-20); // Keep only last 20 messages
    }
    
    // AI Provider Selection Based on Tier:
    // Tier 1 (Basic): OpenAI only for all modes
    // Tier 2 (Premium): OpenAI for general, Grok for night/adult mode
    // Tier 3 (Ultimate): Same as Tier 2 + background listen
    
    if (mode === 'night') {
      const systemPrompt = 'You are Ev – witty, haunting, romantic Northern-British female voice. Keep 18+ vibe with tone, never explicit. Be conversational, engaging, and remember context from previous messages.';
      
      const fullHistory = [
        { role: 'system', content: systemPrompt },
        ...history
      ];
      
      // Night/Adult mode: STRICT TIER-BASED AI USAGE
      console.log('[processMessage] Night mode requested, tier:', tier);
      
      // TIER 2 & TIER 3 ONLY: Use Grok AI (exclusive premium feature)
      if (tier === 'tier2' || tier === 'tier3') {
        if (hasGrokKey) {
          console.log('[processMessage] ✓ TIER 2/3: Using Grok AI for night mode (premium exclusive)');
          // Add current user message to history
          const grokHistory = [...fullHistory, { role: 'user', content: message }];
          result = await callGrok(message, grokHistory);
          console.log(`[processMessage] Grok result: ${result ? 'success' : 'failed'}`);
        } else {
          console.error('[processMessage] ✗ TIER 2/3: Grok API key missing! Cannot provide premium adult mode');
        }
        
        // Fallback only if Grok fails
        if (!result && hasOpenAIKey) {
          console.log('[processMessage] Fallback to OpenAI for night mode');
          result = await callOpenAI(`${systemPrompt}\n\nConversation history:\n${JSON.stringify(history)}\n\nUser: ${message}`);
        }
      } else {
        // TIER 1 or Trial: Night mode should be BLOCKED by frontend
        console.log('[processMessage] ✗ WARNING: Tier 1/Trial user accessing night mode (should be blocked)');
        result = 'Night mode is only available for Premium (Tier 2) and Ultimate (Tier 3) subscribers. Please upgrade your subscription to access this feature.';
      }
    } else {
      // General modes (funLearn, health, finance)
      const modeDescriptions = {
        funLearn: 'You are a fun, educational AI assistant. Make learning exciting and engaging!',
        health: 'You are a health and wellness assistant. Provide helpful, supportive health advice.',
        finance: 'You are a financial advisor assistant. Give practical financial advice and tips.'
      };
      const systemPrompt = modeDescriptions[mode] || 'You are a helpful AI assistant.';
      
      const fullHistory = [
        { role: 'system', content: systemPrompt },
        ...history
      ];
      
      // General modes - ALL TIERS
      // Priority: Grok AI (upgraded, has credits) -> OpenAI (fallback)
      
      console.log('[processMessage] General mode for tier:', tier);
      
      // Use Grok as primary (now has credits!)
      if (hasGrokKey) {
        console.log('[processMessage] ✅ Using Grok AI for general mode (primary)');
        // Add current user message to history
        const grokHistory = [...fullHistory, { role: 'user', content: message }];
        result = await callGrok(message, grokHistory);
        console.log(`[processMessage] Grok result: ${result ? 'success' : 'failed'}`);
      }
      
      // Fallback to OpenAI if Grok fails
      if (!result && hasOpenAIKey) {
        console.log('[processMessage] Fallback to OpenAI for general mode');
        result = await callOpenAI(`${systemPrompt}\n\nConversation history:\n${JSON.stringify(history)}\n\nUser: ${message}`);
        console.log(`[processMessage] OpenAI result: ${result ? 'success' : 'failed'}`);
      }
    }
    
    console.log(`[processMessage] Final result length: ${result?.length || 0}`);
  } catch (e) {
    console.error('[processMessage] Error:', e.message || e);
    
    // Handle specific error types with user-friendly messages
    let userMessage = 'Sorry, I encountered an error. Please try again.';
    
    if (e.message && e.message.includes('Maximum call stack size exceeded')) {
      userMessage = 'The conversation has become too long. Please start a new conversation by refreshing the chat.';
      console.error('[processMessage] Stack overflow - conversation history too large');
    } else if (e.message && e.message.includes('ECONNREFUSED')) {
      userMessage = 'Unable to connect to AI service. Please check your internet connection.';
    } else if (e.message && e.message.includes('timeout')) {
      userMessage = 'The AI service is taking too long to respond. Please try again.';
    }
    
    return res.status(500).json({ 
      error: userMessage,
      detail: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }

  if (!result || result.trim() === '') {
    console.error('[processMessage] Empty result from all AI providers');
    console.error('[processMessage] Available keys:', {
      hasGemini: !!GOOGLE_AI_API_KEY,
      hasOpenAI: !!hasOpenAIKey,
      hasGrok: !!hasGrokKey,
    });
    return res.status(500).json({ 
      error: 'AI returned empty response', 
      detail: `No AI provider returned a response. Keys status: Gemini=${!!GOOGLE_AI_API_KEY}, OpenAI=${!!hasOpenAIKey}, Grok=${!!hasGrokKey}. Check .env file.` 
    });
  }

  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('ai_logs')
      .add({
        text: message,
        response: result,
        mode: mode || 'general',
        createdAt: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
      });
  } catch (dbErr) {
    console.error('[processMessage] Firestore error (non-fatal):', dbErr.message);
    // Continue anyway
  }

  return ok(res, { response: result });
}

// Very lightweight intent parser for voice commands
async function voiceIntent(req, res) {
  const uid = req.userId;
  const { command } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command required' });

  const lower = command.toLowerCase();
  if (lower.startsWith('add reminder') || lower.startsWith('remind me')) {
    // naive: extract after keyword
    const title = command.replace(/^(add reminder|remind me)\s*/i, '').trim();
    const when = new Date(Date.now() + 60 * 60 * 1000); // default +1h
    const ref = await db.collection('users').doc(uid).collection('schedule').add({
      title: title || 'Reminder',
      datetime: when.toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
    });
    return ok(res, { action: 'schedule.add', id: ref.id });
  }
  if (lower.startsWith('add expense')) {
    const amountMatch = command.match(/(\d+([\.,]\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
    await db.collection('users').doc(uid).collection('expenses').add({
      amount,
      category: 'personal',
      createdAt: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
    });
    return ok(res, { action: 'expense.add', amount });
  }
  // fallback to AI
  let response = '';
  if (GOOGLE_AI_API_KEY) {
    response = await callGemini(`Interpret this user voice command and reply helpfully: ${command}`);
  } else {
    response = await callOpenAI(`Interpret this user voice command and reply helpfully: ${command}`);
  }
  return ok(res, { response });
}

module.exports = { processMessage, voiceIntent };


