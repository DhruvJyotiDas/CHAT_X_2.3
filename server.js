const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const Sentiment = require('sentiment');
const sentiment = new Sentiment();

const axios = require('axios');

const { createProxyMiddleware } = require('http-proxy-middleware'); // 🔁 NEW: Proxy for Python AI

/*
// Add body parsing middleware for JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔁 Add this proxy to forward /summarize requests to FastAPI backend


// ✅ Register proxy before static routes
app.use('/summarize', (req, res, next) => {
  console.log(`🔁 Proxying summarize request: ${req.method} ${req.originalUrl}`);
  next();
}, createProxyMiddleware({
  target: 'https://edea-2401-4900-6326-adea-9546-79e8-7057-cca8.ngrok-free.app',
  changeOrigin: true,
}));
*/

// Add body parsing middleware for JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const GEMINI_API_KEY = 'AIzaSyBWSUg8x3ljYqXabdHLMyzJSZeAuDWmIgk';
app.post('/summarize', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const prompt = `Summarize the following text:\n\n${text}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // Fix summary extraction: Gemini API returns 'candidates' array with 'content' as string or object
    let summary = text;
    if (response.data && Array.isArray(response.data.candidates) && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (typeof candidate.content === 'string') {
        summary = candidate.content;
      } else if (typeof candidate.content === 'object' && Array.isArray(candidate.content.parts)) {
        // Concatenate all text parts
        summary = candidate.content.parts.map(part => part.text).join('');
      } else if (typeof candidate.content === 'object' && candidate.content.text) {
        summary = candidate.content.text;
      } else {
        summary = JSON.stringify(candidate.content);
      }
    }
    res.json({ summary });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.post('/summarize', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const prompt = `Summarize the following text:\n\n${text}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // Fix summary extraction: Gemini API returns 'candidates' array with 'content' as string or object
    let summary = text;
    if (response.data && Array.isArray(response.data.candidates) && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (typeof candidate.content === 'string') {
        summary = candidate.content;
      } else if (typeof candidate.content === 'object' && Array.isArray(candidate.content.parts)) {
        // Concatenate all text parts
        summary = candidate.content.parts.map(part => part.text).join('');
      } else if (typeof candidate.content === 'object' && candidate.content.text) {
        summary = candidate.content.text;
      } else {
        summary = JSON.stringify(candidate.content);
      }
    }
    res.json({ summary });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.post('/translate', async (req, res) => {
  const { text, targetLanguage } = req.body;
  if (!text || !targetLanguage) return res.status(400).json({ error: 'Text and target language are required' });

  let prompt = `Translate the following text to ${targetLanguage}:\n\n${text}`;
  if (targetLanguage === 'hi') {
    prompt += "\n\nPlease provide a concise, natural-sounding translation without explanations or multiple options.";
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    let translation = text;
    if (response.data && Array.isArray(response.data.candidates) && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (typeof candidate.content === 'string') {
        translation = candidate.content;
      } else if (typeof candidate.content === 'object' && Array.isArray(candidate.content.parts)) {
        translation = candidate.content.parts.map(part => part.text).join('');
      } else if (typeof candidate.content === 'object' && candidate.content.text) {
        translation = candidate.content.text;
      } else {
        translation = JSON.stringify(candidate.content);
      }
    }
    res.json({ translation });
  } catch (error) {
    console.error('Gemini API translation error:', error);
    res.status(500).json({ error: 'Failed to generate translation' });
  }
});

// ✅ Then static files
app.use(express.static(path.join(__dirname, 'client')));
mongoose.connect("mongodb+srv://admin:admin@cluster0.zzinnu7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", { family: 4 })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

const User = require('./models/User');

app.post('/register', async (req, res) => {
  const { username, password, dob, gender } = req.body;
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "User already exists" });

    const newUser = new User({ username, password, dob, gender, contacts: [], messages: [] });
    await newUser.save();
    res.status(200).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    res.status(200).json({ message: "Login successful", username: user.username, token: "dummy-token" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

let clients = {};
let groups = {};

wss.on("connection", (ws) => {
  console.log('🟢 New WebSocket connection');
  let username = null;

  ws.on("message", async (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error("Invalid JSON:", error);
      return;
    }

    if (message.type === "connect") {
      username = message.username;
      if (clients[username]) {
        ws.send(JSON.stringify({ type: "error", message: "Username already taken" }));
        ws.close();
        return;
      }
      clients[username] = ws;
      console.log(`✅ ${username} connected`);
      ws.send(JSON.stringify({ type: "connect-response", success: true, username }));
      broadcastUserList();
    }

    else if (message.type === "message") {
      // Call Python API for spam/abuse prediction
      try {
        const response = await axios.post('http://localhost:8002/predict', { message: message.message });
        if (response.data.prediction === 'spam') {
          ws.send(JSON.stringify({ type: "error", message: "Message detected as spam or abuse and was blocked." }));
          return;
        }
      } catch (err) {
        console.error("Spam detection API error:", err);
        // Proceed without blocking if API fails
      }

      const isGroup = message.recipient.startsWith("group-");
      const timestamp = new Date();

      const result = sentiment.analyze(message.message);
      let mood = "neutral";
      if (result.score > 2) mood = "happy";
      else if (result.score < -2) mood = "sad";
      else if (result.score < 0) mood = "angry";

      const payload = {
        type: "message",
        sender: message.sender,
        recipient: message.recipient,
        message: message.message,
        timestamp: timestamp.toLocaleString(),
        mood: mood
      };

      try {
        await User.updateOne(
          { username: message.sender, "messages.with": message.recipient },
          { $addToSet: { contacts: message.recipient }, $push: { "messages.$.chat": { sender: message.sender, message: message.message, timestamp } } }
        );
        await User.updateOne(
          { username: message.sender, "messages.with": { $ne: message.recipient } },
          { $addToSet: { contacts: message.recipient }, $push: { messages: { with: message.recipient, chat: [{ sender: message.sender, message: message.message, timestamp }] } } }
        );
        await User.updateOne(
          { username: message.recipient, "messages.with": message.sender },
          { $addToSet: { contacts: message.sender }, $push: { "messages.$.chat": { sender: message.sender, message: message.message, timestamp } } }
        );
        await User.updateOne(
          { username: message.recipient, "messages.with": { $ne: message.sender } },
          { $addToSet: { contacts: message.sender }, $push: { messages: { with: message.sender, chat: [{ sender: message.sender, message: message.message, timestamp }] } } }
        );
      } catch (err) {
        console.error("❌ MongoDB chat save error:", err);
      }

      if (isGroup && groups[message.recipient]) {
        groups[message.recipient].forEach(member => {
          if (member !== message.sender && clients[member]) {
            clients[member].send(JSON.stringify(payload));
          }
        });
      } else if (clients[message.recipient]) {
        clients[message.recipient].send(JSON.stringify(payload));
      }
    }

    else if (message.type === "typing") {
      const peer = clients[message.recipient];
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: "typing", sender: message.sender }));
      }
    }

    else if (
      message.type === "call-request" ||
      message.type === "call-accepted" ||
      message.type === "call-declined"
    ) {
      const peer = clients[message.to];
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(message));
      }
    }

    else if (
      message.type === "call-offer" ||
      message.type === "call-answer" ||
      message.type === "call-candidate"
    ) {
      const peer = clients[message.to];
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(message));
      }
    }
  });

  ws.on("close", () => {
    if (username && clients[username]) {
      console.log(`🔌 ${username} disconnected`);
      delete clients[username];
      broadcastUserList();
    }
  });
});

function broadcastUserList() {
  const users = Object.keys(clients);
  const msg = JSON.stringify({ type: "updateUsers", users });
  for (let user in clients) {
    if (clients[user].readyState === WebSocket.OPEN) {
      clients[user].send(msg);
    }
  }
}

app.get('/history', async (req, res) => {
  const { user, peer } = req.query;
  if (!user || !peer) return res.status(400).json({ error: "Missing user or peer" });

  try {
    const currentUser = await User.findOne({ username: user });
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    const history = currentUser.messages.find(entry => entry.with === peer);
    if (!history) return res.json([]);

    res.json(history.chat);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server (HTTP + WS) running on port ${PORT}`);
});
