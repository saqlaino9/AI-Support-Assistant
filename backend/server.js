require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');
const db = require('./db');
const docs = require('./docs.json');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Google Gen AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Basic rate limiting per IP (Assignment Requirement)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, 
  message: { error: "Too many requests, please try again later." }
});

// Helper functions to use Promises with SQLite
const runQuery = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this) }));
const getQuery = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

// System Prompt enforcing the strict document-only rule
const SYSTEM_PROMPT = `
You are an AI Support Assistant. 
You MUST answer the user's question ONLY using the provided product documentation below.
If the answer is NOT explicitly in the documentation, you MUST respond exactly with: "Sorry, I don’t have information about that."
Do not hallucinate, do not guess, and do not use outside knowledge.

[PRODUCT DOCUMENTATION]
${JSON.stringify(docs)}
[END DOCUMENTATION]
`;

// --- API Endpoints ---

// A. Chat Endpoint
app.post('/api/chat', limiter, async (req, res) => {
  const { sessionId, message } = req.body;
  
  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId or message" });
  }

  try {
    // 1. Upsert Session
    await runQuery(`INSERT OR IGNORE INTO sessions (id) VALUES (?)`, [sessionId]);
    await runQuery(`UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);

    // 2. Fetch last 10 messages (5 pairs) for context
    const history = await getQuery(`
      SELECT role, content FROM messages 
      WHERE session_id = ? ORDER BY created_at DESC LIMIT 10
    `, [sessionId]);
    history.reverse(); // Put back in chronological order

    // 3. Save the new user message to SQLite
    await runQuery(`INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)`, [sessionId, message]);

    // 4. Format history for Gemini SDK
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
    // Append the current user message
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 5. Call Gemini LLM
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1 // Low temperature to prevent hallucination
      }
    });

    const reply = response.text;
    const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

    // 6. Save Assistant Response to SQLite
    await runQuery(`INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)`, [sessionId, reply]);

    res.json({ reply, tokensUsed });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Failed to process chat request." });
  }
});

// B. Fetch Conversation
app.get('/api/conversations/:sessionId', async (req, res) => {
  try {
    const messages = await getQuery(`
      SELECT role, content, created_at FROM messages 
      WHERE session_id = ? ORDER BY created_at ASC
    `, [req.params.sessionId]);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Database error fetching conversation." });
  }
});

// C. List Sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getQuery(`SELECT id, updated_at FROM sessions ORDER BY updated_at DESC`);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: "Database error fetching sessions." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});