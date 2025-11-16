const admin = require('firebase-admin');
const { OpenAI } = require('openai');
// Node 20+ has native fetch, no need for node-fetch
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ok } = require('./utils');
const { checkMessageLimit, incrementMessageCount, getRemainingQuota } = require('./usage-limits');

const db = admin.firestore();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const genAI = GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(GOOGLE_AI_API_KEY) : null;

async function callOpenAI(prompt, history = [], fast = false) {
  if (process.env.MOCK_AI === 'true') {
    return `Mock response: ${prompt.slice(0, 60)}...`;
  }
  if (!openai) {
    console.error('OpenAI: Client not initialized - check OPENAI_API_KEY');
    return '';
  }
  try {
    // ⚡ INSTANT: Limit history to last 2 messages for speed
    const messages = history.length > 0 ? history.slice(-2) : [{ role: 'user', content: prompt }];
    
    // ⚡ ULTRA-FAST: Minimal tokens for instant responses
    const maxTokens = fast ? 100 : 200;  // Very short = faster!
    
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.3,  // Lower = faster, more deterministic
      max_tokens: maxTokens,
      top_p: 0.8,  // More focused
    });
    return resp.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('OpenAI API error:', e.message || e);
    const msg = e?.message || '';
    if (msg.includes('429') || msg.includes('quota')) {
      console.error('❌ OpenAI: Rate limited or insufficient quota');
    }
    return '';
  }
}

async function callGrok(prompt, conversationHistory = [], fast = false) {
  const apiKey = process.env.XAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ [Grok] XAI_API_KEY not found in environment');
    return '';
  }
  
  try {
    // ⚡ INSTANT RESPONSE: Limit history to last 2 messages only (reduces processing time)
    let messages = [];
    if (conversationHistory && conversationHistory.length > 0) {
      // Keep only last 2 messages for speed
      messages = conversationHistory.slice(-2);
    } else {
      messages = [{ role: 'user', content: prompt }];
    }
    
    // ⚡ ULTRA-FAST: Minimal tokens for instant responses
    const maxTokens = fast ? 80 : 120;  // Very short responses = faster!
    
    console.log(`[Grok] ⚡ INSTANT MODE: grok-4, tokens: ${maxTokens}, history: ${messages.length}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout (faster fail)
    
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${apiKey}` 
      },
      body: JSON.stringify({ 
        model: 'grok-4', 
        messages: messages,
        temperature: 0.3,  // Lower = faster, more deterministic
        max_tokens: maxTokens,  // Minimal tokens
        top_p: 0.8,  // More focused
        stream: false,  // Non-streaming is faster for short responses
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`❌ [Grok] API error ${resp.status}:`, errorText.substring(0, 200));
      return '';
    }
    
    const data = await resp.json();
    const result = data.choices?.[0]?.message?.content || '';
    
    if (!result || result.trim() === '') {
      console.error('❌ [Grok] Empty response');
      return '';
    }
    
    console.log(`✅ [Grok] INSTANT! ${result.length} chars`);
    return result;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('❌ [Grok] Timeout after 6s');
    } else {
      console.error(`❌ [Grok] Error:`, e.message);
    }
    return '';
  }
}

/// Call Gemini with image/file attachments (Vision API)
async function callGeminiWithAttachments(prompt, attachments, history, systemPrompt, fast = false) {
  if (process.env.MOCK_AI === 'true') {
    return `Mock (Gemini Vision) response: ${prompt.slice(0, 60)}...`;
  }
  if (!genAI) {
    console.error('❌ Gemini: genAI not initialized - check GOOGLE_AI_API_KEY');
    return '';
  }
  
  try {
    // Use Gemini 1.5 Flash or Pro for vision (2.5 Flash may not support vision yet)
    const modelName = 'models/gemini-1.5-flash';
    console.log(`[Gemini Vision] 🖼️ Using ${modelName} for image analysis`);
    
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: fast ? 200 : 400,  // More tokens for image analysis
        topP: 0.8,
        topK: 20,
      },
    });
    
    // Build content array with text and images
    const parts = [];
    
    // Add system prompt and conversation context
    const contextPrompt = systemPrompt 
      ? `${systemPrompt}\n\nRecent conversation:\n${history.slice(-2).map(h => `${h.role}: ${h.content}`).join('\n')}\n\nUser prompt: ${prompt}`
      : `Recent conversation:\n${history.slice(-2).map(h => `${h.role}: ${h.content}`).join('\n')}\n\nUser prompt: ${prompt}`;
    
    parts.push({ text: contextPrompt });
    
    // Add images from attachments
    for (const attachment of attachments) {
      if (attachment.fileType === 'image' && attachment.url) {
        console.log(`[Gemini Vision] 📷 Adding image: ${attachment.fileName}`);
        
        try {
          // Fetch image from URL
          const imageResponse = await fetch(attachment.url);
          if (!imageResponse.ok) {
            console.error(`❌ [Gemini Vision] Failed to fetch image: ${attachment.url}`);
            continue;
          }
          
          // Convert to base64
          const imageBuffer = await imageResponse.arrayBuffer();
          const imageBase64 = Buffer.from(imageBuffer).toString('base64');
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
          
          // Add image to parts
          parts.push({
            inlineData: {
              data: imageBase64,
              mimeType: mimeType,
            }
          });
          
          console.log(`✅ [Gemini Vision] Image added: ${attachment.fileName} (${mimeType})`);
        } catch (imgErr) {
          console.error(`❌ [Gemini Vision] Error processing image ${attachment.fileName}:`, imgErr.message);
          // Continue with other images
        }
      } else if (attachment.fileType === 'document' && attachment.url) {
        // For documents, add description to prompt
        console.log(`[Gemini Vision] 📄 Document detected: ${attachment.fileName}`);
        parts.push({ 
          text: `\n\n[Document attached: ${attachment.fileName} - URL: ${attachment.url}. Please analyze this document based on the user's prompt.]` 
        });
      }
    }
    
    if (parts.length === 1) {
      // No images were added, fall back to text-only
      console.log('[Gemini Vision] ⚠️ No images processed, using text-only mode');
      return await callGemini(prompt, modelName, fast);
    }
    
    console.log(`[Gemini Vision] 📤 Sending ${parts.length - 1} image(s) with prompt...`);
    
    // Generate content with images - Gemini API accepts parts directly
    const result = await model.generateContent(parts);
    const text = result.response?.text();
    
    if (!text || text.trim() === '') {
      console.error(`❌ [Gemini Vision] Empty response from API`);
      console.error(`[Gemini Vision] Full result:`, JSON.stringify(result, null, 2));
      return '';
    }
    
    console.log(`✅ [Gemini Vision] SUCCESS! ${text.length} chars`);
    return text;
  } catch (e) {
    console.error(`❌ [Gemini Vision] Error:`, e.message);
    console.error(`[Gemini Vision] Error details:`, e.stack);
    
    // Fallback to text-only mode
    console.log(`[Gemini Vision] 🔄 Fallback to text-only mode`);
    return await callGemini(prompt, 'models/gemini-1.5-flash', fast);
  }
}

async function callGemini(prompt, modelName = 'models/gemini-2.5-flash', fast = false) {
  if (process.env.MOCK_AI === 'true') {
    return `Mock (Gemini) response: ${prompt.slice(0, 60)}...`;
  }
  if (!genAI) {
    console.error('❌ Gemini: genAI not initialized - check GOOGLE_AI_API_KEY');
    return '';
  }
  try {
    // ⚡ INSTANT RESPONSE: Ultra-optimized settings for speed
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature: 0.3,  // Lower = faster, more deterministic
        maxOutputTokens: fast ? 100 : 200,  // Minimal tokens for instant responses
        topP: 0.8,  // More focused
        topK: 20,   // Fewer choices = faster
      },
    });
    
    console.log(`[Gemini] 📤 Calling ${modelName} with ${prompt.length} chars...`);
    const result = await model.generateContent(prompt);
    const text = result.response?.text();
    
    if (!text || text.trim() === '') {
      console.error(`❌ [${modelName}] Empty response from API`);
      console.error(`[Gemini] Full result:`, JSON.stringify(result, null, 2));
      // Try fallback
      throw new Error('Empty response from primary model');
    }
    
    console.log(`✅ [Gemini] INSTANT! ${text.length} chars`);
    return text;
  } catch (e) {
    console.error(`❌ [${modelName}] Error:`, e.message);
    console.error(`[Gemini] Error details:`, e.stack);
    
    // Quick fallback to 2.0-flash (tested working)
    if (modelName !== 'models/gemini-2.0-flash') {
      try {
        console.log(`[Gemini] 🔄 Trying fallback: models/gemini-2.0-flash`);
        const model = genAI.getGenerativeModel({ 
          model: 'models/gemini-2.0-flash',
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: fast ? 100 : 200,
          },
        });
        const result = await model.generateContent(prompt);
        const text = result.response?.text();
        if (text && text.trim()) {
          console.log(`✅ [Gemini 2.0] Fallback success! ${text.length} chars`);
          return text;
        } else {
          console.error(`❌ [Gemini 2.0] Fallback also returned empty`);
        }
      } catch (fallbackErr) {
        console.error(`❌ [Gemini 2.0] Fallback error:`, fallbackErr.message);
      }
    }
    
    // Last fallback: try gemini-1.5-flash
    if (modelName !== 'models/gemini-1.5-flash') {
      try {
        console.log(`[Gemini] 🔄 Trying last fallback: models/gemini-1.5-flash`);
        const model = genAI.getGenerativeModel({ 
          model: 'models/gemini-1.5-flash',
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: fast ? 100 : 200,
          },
        });
        const result = await model.generateContent(prompt);
        const text = result.response?.text();
        if (text && text.trim()) {
          console.log(`✅ [Gemini 1.5] Last fallback success! ${text.length} chars`);
          return text;
        }
      } catch (_) {
        // Ignore last fallback error
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
    
    // Return with both schedule.add action and calendar event creation action
    return ok(res, { 
      response, 
      action: 'schedule.add', 
      scheduleId: scheduleRef.id,
      backgroundAction: {
        type: 'create_calendar_event',
        data: {
          title: extractedData.title,
          startTime: extractedData.datetime,
          description: extractedData.note || message,
        },
        message: 'Adding to device calendar...'
      }
    });
  } catch (e) {
    console.error('[handleSchedulingIntent] Error:', e);
    // Fallback to regular AI response
    return processMessage(req, res);
  }
}

// Helper function to handle Google Meet scheduling
async function handleGoogleMeetIntent(req, res, message, tier) {
  const uid = req.userId;
  
  try {
    // Use AI to extract meet details (similar to scheduling)
    const extractionPrompt = `Extract the following from this Google Meet scheduling request: "${message}"
    
Return ONLY a JSON object with these fields:
{
  "title": "brief title for the meeting",
  "datetime": "ISO 8601 datetime string",
  "attendees": ["list", "of", "attendee", "names"],
  "description": "any additional details"
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
        console.log('[GoogleMeet] AI response parsing failed, using fallback');
      }
    }
    
    // Fallback: Simple parsing
    if (!extractedData) {
      const now = new Date();
      let scheduledTime = new Date();
      
      // Extract time
      let timeMatch = message.match(/(\d{1,2})\s*(pm|am|baje)/i);
      if (!timeMatch) {
        timeMatch = message.match(/(\d{1,2}):(\d{2})/);
      }
      
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'pm' && hour < 12) {
          hour += 12;
        }
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        if (hour >= 1 && hour <= 7 && !timeMatch[2]) {
          hour += 12;
        }
        scheduledTime.setHours(hour, timeMatch[3] ? parseInt(timeMatch[3]) : 0, 0, 0);
      }
      
      // Check for "today", "tomorrow"
      const lower = message.toLowerCase();
      if (lower.includes('tomorrow') || lower.includes('kal')) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      
      // Extract attendees (people mentioned)
      const attendees = [];
      const personMatches = message.match(/with\s+(\w+)|(\ w+)\s+ke\s+sath/gi);
      if (personMatches) {
        personMatches.forEach(match => {
          const name = match.replace(/with|ke sath/gi, '').trim();
          if (name) attendees.push(name);
        });
      }
      
      // Extract title
      let title = 'Google Meet';
      const topicMatch = message.match(/topic\s+(\w+)|about\s+(\w+)/i);
      if (topicMatch) {
        title = `${topicMatch[1] || topicMatch[2]} - Google Meet`;
      } else if (attendees.length > 0) {
        title = `Meet with ${attendees.join(', ')}`;
      }
      
      extractedData = {
        title: title,
        datetime: scheduledTime.toISOString(),
        attendees: attendees,
        description: `Video meeting via Google Meet. ${message}`,
      };
    }
    
    // Add to schedule in Firestore
    const scheduleRef = await db.collection('users').doc(uid).collection('schedule').add({
      title: extractedData.title,
      datetime: extractedData.datetime,
      note: extractedData.description || '',
      type: 'google_meet',
      attendees: extractedData.attendees || [],
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
    
    const attendeesList = extractedData.attendees && extractedData.attendees.length > 0
      ? ` with ${extractedData.attendees.join(', ')}`
      : '';
    
    const response = `Perfect! I've scheduled a Google Meet "${extractedData.title}"${attendeesList} for ${dateStr} at ${timeStr}. The meeting has been added to your calendar with a Google Meet link, and you'll get a reminder 10 minutes before the meeting starts.`;
    
    // Log the action
    await db.collection('users').doc(uid).collection('ai_logs').add({
      text: message,
      response: response,
      action: 'google_meet.create',
      scheduleId: scheduleRef.id,
      mode: req.body.mode || 'general',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Return with Google Meet creation action
    return ok(res, { 
      response, 
      action: 'google_meet.create', 
      scheduleId: scheduleRef.id,
      backgroundAction: {
        type: 'create_google_meet',
        data: {
          title: extractedData.title,
          startTime: extractedData.datetime,
          description: extractedData.description || message,
          attendees: extractedData.attendees || [],
        },
        message: 'Creating Google Meet and adding to calendar...'
      }
    });
  } catch (e) {
    console.error('[handleGoogleMeetIntent] Error:', e);
    // Fallback to regular AI response
    return processMessage(req, res);
  }
}

async function processMessage(req, res) {
  const uid = req.userId;
  const { message, mode, conversationHistory, tierLevel, fast, replyStyle, voiceChat, attachments } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const tier = tierLevel || 'free';  // Default to free tier if not specified
  const hasGrokKey = !!process.env.XAI_API_KEY;
  const hasOpenAIKey = !!OPENAI_API_KEY;
  const isVoiceChat = voiceChat === true;  // Voice chat session flag
  const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
  
  console.log(`[processMessage] tier: ${tier}, mode: ${mode}, fast: ${!!fast}, replyStyle: ${replyStyle || 'default'}, voiceChat: ${isVoiceChat}, attachments: ${hasAttachments ? attachments.length : 0}, hasGrokKey: ${hasGrokKey}, hasOpenAIKey: ${hasOpenAIKey}`);
  
  // ===== USAGE LIMITS CHECK (prevent abuse and control costs) =====
  // ⚡ VOICE CHAT: Allow unlimited messages within a voice session
  // Skip quota check for voice chat sessions, but still track usage for analytics
  let limitCheck;
  if (isVoiceChat) {
    console.log(`[processMessage] 🎤 Voice chat session - skipping quota check, allowing unlimited messages`);
    // Still check quota for info, but don't block
    limitCheck = await checkMessageLimit(uid, tier);
    console.log(`[processMessage] ℹ️ Voice chat quota info: ${limitCheck.remainingTotal} total, ${limitCheck.remainingToday} today (not blocking)`);
  } else {
    // Regular chat - enforce quota limits
    limitCheck = await checkMessageLimit(uid, tier);
    
    if (!limitCheck.allowed) {
      console.log(`[processMessage] ⛔ Message blocked: ${limitCheck.reason}`);
      return res.status(429).json({
        error: 'limit_exceeded',
        message: limitCheck.reason,
        remainingTotal: limitCheck.remainingTotal,
        remainingToday: limitCheck.remainingToday,
        usage: limitCheck.usage,
      });
    }
    
    console.log(`[processMessage] ✅ Usage check passed. Remaining: ${limitCheck.remainingTotal} total, ${limitCheck.remainingToday} today`);
  }

  // Check for scheduling intent (supports English + Hindi/Hinglish)
  const lowerMessage = message.toLowerCase();
  
  // Check for Google Meet specific request
  const googleMeetKeywords = ['google meet', 'meet', 'video call', 'video meeting', 'online meeting'];
  const hasGoogleMeet = googleMeetKeywords.some(kw => lowerMessage.includes(kw));
  
  // Keywords for scheduling (English + Hindi)
  const scheduleKeywords = ['add', 'create', 'schedule', 'krdo', 'karna', 'lagao', 'set'];
  const scheduleTargets = ['meeting', 'reminder', 'calendar', 'calender', 'event', 'appointment', 'मीटिंग'];
  
  const hasScheduleAction = scheduleKeywords.some(kw => lowerMessage.includes(kw));
  const hasScheduleTarget = scheduleTargets.some(kw => lowerMessage.includes(kw));
  
  // Handle Google Meet scheduling
  if (hasGoogleMeet && hasScheduleAction) {
    console.log('[AI] Google Meet scheduling intent detected!');
    return await handleGoogleMeetIntent(req, res, message, tier);
  }
  
  // Handle regular scheduling
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
    // ⚡ INSTANT RESPONSE: Limit to last 2 messages only (ultra-fast!)
    // This makes AI respond instantly by reducing processing time
    let history = conversationHistory || [];
    if (history.length > 2) {
      console.log(`[processMessage] ⚡ INSTANT: Trimming history from ${history.length} to 2 messages`);
      history = history.slice(-2); // Keep only last 2 messages for speed
    }
    
    // AI Provider Selection Based on Tier & Speed
    // Priority: Speed over complexity when fast=true
    
    if (mode === 'night') {
      const systemPrompt = 'You are Ev – witty, haunting, romantic. Keep 18+ vibe with tone. Be conversational, brief.';
      
      const fullHistory = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ];
      
      // TIER 2 & TIER 3 ONLY: Use Grok AI
      if (tier === 'tier2' || tier === 'tier3') {
        if (hasGrokKey) {
          console.log('[processMessage] ⚡ TIER 2/3: Grok AI (night mode)');
          result = await callGrok(message, fullHistory, fast);
        }
        
        // Quick fallback to OpenAI if Grok fails
        if (!result && hasOpenAIKey) {
          console.log('[processMessage] ⚡ Fallback to OpenAI');
          result = await callOpenAI(`${systemPrompt}\n\nRecent chat: ${history.slice(-2).map(h => `${h.role}: ${h.content}`).join('\n')}\n\nUser: ${message}`, fullHistory, fast);
        }
      } else {
        result = 'Night mode is only available for Premium (Tier 2+) subscribers. Please upgrade.';
      }
    } else {
      // General modes - ALL TIERS
      const modePrompts = {
        funLearn: 'You are a fun educational AI. Be brief, engaging.',
        health: 'You are a health assistant. Be helpful, brief.',
        finance: 'You are a finance advisor. Be practical, brief.'
      };
      const systemPrompt = modePrompts[mode] || 'You are a helpful AI assistant. Be brief.';
      
      const fullHistory = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ];
      
      // ⚡ INSTANT RESPONSE STRATEGY: Always use FASTEST AI first!
      // Priority: Gemini 2.5 Flash (FASTEST) > OpenAI (FAST) > Grok (SLOW - only for night mode)
      
      // ALWAYS try Gemini first (FASTEST) - for ALL users, ALL modes
      // If attachments exist, use Gemini Vision API
      if (GOOGLE_AI_API_KEY) {
        if (hasAttachments) {
          console.log('[processMessage] 🖼️ Using Gemini Vision API for image/file analysis');
          try {
            result = await callGeminiWithAttachments(message, attachments, history, systemPrompt, true);
            if (result && result.trim()) {
              console.log(`[processMessage] ✅ Gemini Vision success: ${result.length} chars`);
            } else {
              console.error('[processMessage] ❌ Gemini Vision returned empty result');
            }
          } catch (visionErr) {
            console.error('[processMessage] ❌ Gemini Vision error:', visionErr.message);
            result = '';
          }
        } else {
          console.log('[processMessage] ⚡ INSTANT: Using Gemini 2.5 Flash (FASTEST)');
          try {
            // Simple prompt for speed
            const simplePrompt = `${systemPrompt}\nRecent: ${history.slice(-2).map(h => `${h.role}: ${h.content}`).join('\n')}\nUser: ${message}\nAssistant:`;
            result = await callGemini(simplePrompt, 'models/gemini-2.5-flash', true);
            if (result && result.trim()) {
              console.log(`[processMessage] ✅ Gemini success: ${result.length} chars`);
            } else {
              console.error('[processMessage] ❌ Gemini returned empty result');
            }
          } catch (geminiErr) {
            console.error('[processMessage] ❌ Gemini error:', geminiErr.message);
            result = '';
          }
        }
      }
      
      // Fallback to OpenAI if Gemini fails (also fast)
      if (!result && hasOpenAIKey) {
        console.log('[processMessage] ⚡ Fallback: Using OpenAI (FAST)');
        try {
          result = await callOpenAI(message, fullHistory, true);
          if (result && result.trim()) {
            console.log(`[processMessage] ✅ OpenAI success: ${result.length} chars`);
          } else {
            console.error('[processMessage] ❌ OpenAI returned empty result');
          }
        } catch (openaiErr) {
          console.error('[processMessage] ❌ OpenAI error:', openaiErr.message);
          result = '';
        }
      }
      
      // LAST RESORT: Use Grok if both Gemini and OpenAI failed (available for all users as fallback)
      if (!result && hasGrokKey) {
        console.log('[processMessage] ⚠️ Last resort: Using Grok (all tiers)');
        try {
          result = await callGrok(message, fullHistory, true);
          if (result && result.trim()) {
            console.log(`[processMessage] ✅ Grok success: ${result.length} chars`);
          } else {
            console.error('[processMessage] ❌ Grok returned empty result');
          }
        } catch (grokErr) {
          console.error('[processMessage] ❌ Grok error:', grokErr.message);
          console.error('[processMessage] Grok error stack:', grokErr.stack);
          result = '';
        }
      }
    }
    
    // Apply reply style shortening if requested
    if (replyStyle === 'short' && result) {
      result = shortenToTwoSentences(result);
    }
    
    console.log(`[processMessage] ✅ Response ready (${result?.length || 0} chars)`);
  } catch (e) {
    console.error('[processMessage] Error:', e.message || e);
    
    let userMessage = 'Sorry, I encountered an error. Please try again.';
    
    if (e.message?.includes('Maximum call stack') || e.message?.includes('stack overflow')) {
      userMessage = 'Conversation too long. Please start a new chat.';
    } else if (e.message?.includes('ECONNREFUSED') || e.message?.includes('ETIMEDOUT')) {
      userMessage = 'Network error. Please check your connection.';
    } else if (e.message?.includes('timeout') || e.message?.includes('Timeout')) {
      userMessage = 'Request timeout. AI is slow right now, please try again.';
    }
    
    return res.status(500).json({ 
      error: userMessage,
      detail: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }

  // Check if AI returned empty result
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

  // ⚡ SPEED OPTIMIZATION: Get quota quickly (before incrementing)
  let quota = null;
  try {
    quota = await getRemainingQuota(uid, tier);
  } catch (quotaErr) {
    console.error('[processMessage] Error getting quota:', quotaErr.message);
  }

  // Detect actions in the message and AI response
  const action = detectBackgroundAction(message, result);
  
  // ⚡ INSTANT RESPONSE: Return immediately, do logging in background
  // This makes responses feel instant to the user!
  const response = ok(res, { 
    response: result,
    action: action || undefined,
    quota: quota || undefined,
  });
  
  // ===== BACKGROUND TASKS (non-blocking) =====
  // These run AFTER sending response to user
  
  // Increment usage count (background)
  incrementMessageCount(uid).then(() => {
    console.log(`[processMessage] ✅ Usage count incremented (background)`);
  }).catch(err => {
    console.error('[processMessage] Background usage increment error:', err.message);
  });
  
  // Log to Firestore (background)
  db.collection('users')
    .doc(uid)
    .collection('ai_logs')
    .add({
      text: message,
      response: result,
      mode: mode || 'general',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => console.log('[processMessage] ✅ Logged to Firestore (background)'))
    .catch(err => console.error('[processMessage] Background log error:', err.message));
  
  return response;
}

/// Detect background actions from user message
function detectBackgroundAction(userMessage, aiResponse) {
  const lowerMsg = userMessage.toLowerCase();
  const lowerResp = (aiResponse || '').toLowerCase();
  
  // Detect "open calendar" action
  if (lowerMsg.includes('open') && (lowerMsg.includes('calendar') || lowerMsg.includes('calender'))) {
    return {
      type: 'open_calendar',
      message: 'Opening calendar...'
    };
  }
  
  // Detect "schedule meeting" with calendar creation
  if ((lowerMsg.includes('schedule') || lowerMsg.includes('add')) && 
      (lowerMsg.includes('meeting') || lowerMsg.includes('event'))) {
    
    // Extract time, person, topic from message
    const timeMatch = lowerMsg.match(/(\d{1,2})\s*(pm|am|baje)/i);
    const personMatch = lowerMsg.match(/with\s+(\w+)|(\w+)\s+ke\s+sath/i);
    const topicMatch = lowerMsg.match(/topic\s+(\w+[\s\w]*?)(?:\s+at|\s+on|\s+with|$)/i);
    const dateMatch = lowerMsg.match(/tomorrow|today|kal|aaj/i);
    
    let eventTime = new Date();
    if (dateMatch && dateMatch[0].match(/tomorrow|kal/)) {
      eventTime.setDate(eventTime.getDate() + 1);
    }
    
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      if (timeMatch[2] === 'pm' && hour < 12) hour += 12;
      if (timeMatch[2] === 'am' && hour === 12) hour = 0;
      eventTime.setHours(hour, 0, 0, 0);
    }
    
    return {
      type: 'create_calendar_event',
      data: {
        title: personMatch ? `Meeting with ${personMatch[1] || personMatch[2]}` : 'Meeting',
        startTime: eventTime.toISOString(),
        description: topicMatch ? `Topic: ${topicMatch[1]}` : userMessage,
      },
      message: 'Creating calendar event...'
    };
  }
  
  // Detect "open app" actions
  const openAppMatch = lowerMsg.match(/open\s+(gmail|google|maps|youtube|whatsapp|chrome)/i);
  if (openAppMatch) {
    return {
      type: 'open_app',
      data: { app: openAppMatch[1].toLowerCase() },
      message: `Opening ${openAppMatch[1]}...`
    };
  }
  
  // Detect "call" actions - supports both names and phone numbers (SIRI-LIKE)
  const callMatch = lowerMsg.match(/call\s+|dial\s+|phone\s+|ko\s+call/i);
  if (callMatch || lowerMsg.includes('call') || lowerMsg.includes('phone') || lowerMsg.includes('dial')) {
    console.log('[AI] Call intent detected!');
    
    // Try to extract phone number first (priority over name)
    const phoneMatch = userMessage.match(/\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10}|\+\d{11,13}/);
    
    if (phoneMatch) {
      // Phone number found - call directly
      console.log('[AI] Phone number detected:', phoneMatch[0]);
      return {
        type: 'make_call',
        data: { 
          phone: phoneMatch[0],
          contact: null
        },
        message: `Calling ${phoneMatch[0]}...`
      };
    }
    
    // No phone number, try to extract contact name (SUPPORTS MULTI-WORD NAMES!)
    // Patterns: "call John Smith", "John Smith ko call", "phone Sarah Jane"
    
    // Pattern 1: "call [Full Name]" or "phone [Full Name]" or "dial [Full Name]"
    let nameMatch = userMessage.match(/(?:call|phone|dial)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*?)(?:\s+(?:at|on|please|now|sir|mam|ma'am)|$)/i);
    
    // Pattern 2: "[Full Name] ko call" (Hindi)
    if (!nameMatch) {
      nameMatch = userMessage.match(/([A-Za-z]+(?:\s+[A-Za-z]+)*?)\s+ko\s+call/i);
    }
    
    // Pattern 3: Simple "call [word]" as fallback
    if (!nameMatch) {
      nameMatch = userMessage.match(/(?:call|phone|dial)\s+([A-Za-z]+)/i);
    }
    
    if (nameMatch) {
      const contactName = nameMatch[1].trim();
      console.log('[AI] Contact name extracted:', contactName);
      return {
        type: 'make_call',
        data: { 
          contact: contactName,
          phone: null
        },
        message: `Calling ${contactName}...`
      };
    }
    
    // Generic call command - just open phone
    console.log('[AI] Generic call - opening phone app');
    return {
      type: 'make_call',
      data: {},
      message: 'Opening phone...'
    };
  }
  
  // Detect "send message/SMS" actions
  if (lowerMsg.includes('send') && (lowerMsg.includes('message') || lowerMsg.includes('sms'))) {
    return {
      type: 'send_sms',
      data: { },
      message: 'Opening messages...'
    };
  }
  
  return null;
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

// Streamed response for voice chat: splits text into clauses and writes progressively.
async function processMessageStream(req, res) {
  const uid = req.userId;
  const { message, mode, conversationHistory, tierLevel, replyStyle, attachments } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const tier = tierLevel || 'free';
  const hasGrokKey = !!process.env.XAI_API_KEY;
  const hasOpenAIKey = !!OPENAI_API_KEY;
  const hasGeminiKey = !!GOOGLE_AI_API_KEY;

  // Prepare minimal history (last 2)
  let history = Array.isArray(conversationHistory) ? conversationHistory.slice(-2) : [];

  // Compose prompt
  const modePrompts = {
    funLearn: 'You are a fun educational AI. Be brief, engaging.',
    health: 'You are a health assistant. Be helpful, brief.',
    finance: 'You are a finance advisor. Be practical, brief.'
  };
  const systemPrompt = mode === 'night'
    ? 'You are Ev – witty, haunting, romantic. Keep 18+ vibe with tone. Be conversational, brief.'
    : (modePrompts[mode] || 'You are a helpful AI assistant. Be brief.');
  const simplePrompt = `${systemPrompt}\nRecent: ${history.map(h => `${h.role}: ${h.content}`).join('\n')}\nUser: ${message}\nAssistant:`;

  // Generate result quickly prioritizing Gemini
  let result = '';
  try {
    if (hasGeminiKey) {
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        result = await callGeminiWithAttachments(message, attachments, history, systemPrompt, true);
      } else {
        result = await callGemini(simplePrompt, 'models/gemini-2.5-flash', true);
      }
    }
    if (!result && hasOpenAIKey) {
      result = await callOpenAI(message, [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }], true);
    }
    if (!result && hasGrokKey && mode === 'night') {
      result = await callGrok(message, [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }], true);
    }
  } catch (e) {
    console.error('[processMessageStream] generation error:', e.message || e);
    result = '';
  }

  if (replyStyle === 'short' && result) {
    result = shortenToTwoSentences(result);
  }

  // Get quota (non-blocking semantics ok here)
  let quota = null;
  try {
    quota = await getRemainingQuota(uid, tier);
  } catch (e) {
    // ignore quota errors in stream
  }

  const action = detectBackgroundAction(message, result);

  // Streaming headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let aborted = false;
  req.on('aborted', () => { aborted = true; });
  req.on('close', () => { aborted = true; });

  if (!result || !result.trim()) {
    res.end('');
    return;
  }

  // Write clauses progressively
  const clauses = result.split(/(?<=[\.\!\?।])\s+/).filter(Boolean);
  for (const c of clauses) {
    if (aborted) break;
    res.write(c + ' ');
    await new Promise(r => setTimeout(r, 20));
  }

  if (!aborted) {
    // Final metadata trailer
    res.write(`\n` + JSON.stringify({ action, quota }));
    res.end();
  }
}

module.exports = { processMessage, processMessageStream, voiceIntent };



function shortenToTwoSentences(text) {
  try {
    const t = (text || '').trim();
    if (!t) return t;
    // Split by sentence terminators including Hindi full stop
    const parts = t.split(/(?<=[\.\!\?।])\s+/).filter(Boolean);
    const firstTwo = parts.slice(0, 2).join(' ');
    // Ensure not overly long
    if (firstTwo.length < 20 && parts.length > 0) {
      return parts[0];
    }
    return firstTwo;
  } catch (_) {
    return text;
  }
}


