const admin = require('firebase-admin');
const speech = require('@google-cloud/speech');
const { OpenAI } = require('openai');
const { ok } = require('./utils');

const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeGCS(gcsUri) {
  const client = new speech.SpeechClient();
  const request = {
    audio: { uri: gcsUri },
    config: {
      encoding: 'LINEAR16',
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
    },
  };
  const [operation] = await client.longRunningRecognize(request);
  const [response] = await operation.promise();
  const transcript = response.results.map((r) => r.alternatives?.[0]?.transcript || '').join('\n');
  return transcript;
}

async function summarize(text) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Summarize as concise bullet points of meeting minutes.' },
      { role: 'user', content: text },
    ],
  });
  return resp.choices?.[0]?.message?.content || '';
}

async function record(req, res) {
  const uid = req.userId;
  const { audioUrl } = req.body || {};
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl required' });
  const transcript = await transcribeGCS(audioUrl);
  const summary = await summarize(transcript);
  await db.collection('users').doc(uid).collection('moms').add({
    audioUrl,
    transcript,
    summary,
    createdAt: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
  });
  return ok(res, { summary });
}

module.exports = { record };


