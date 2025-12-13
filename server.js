const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
    },
    path: "/socket.io",
});

const Sentiment = require('sentiment');
const sentiment = new Sentiment();

const axios = require('axios');

// Enable CORS for all origins
app.use(cors());

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

        let summary = text;
        if (response.data && Array.isArray(response.data.candidates) && response.data.candidates.length > 0) {
            const candidate = response.data.candidates[0];
            if (typeof candidate.content === 'string') {
                summary = candidate.content;
            } else if (typeof candidate.content === 'object' && Array.isArray(candidate.content.parts)) {
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

io.on("connection", (socket) => {
    console.log('🟢 New client connected', socket.id);
    let username = null;

    socket.on("connect-user", (data) => {
        username = data.username;
        if (!clients[username]) {
            clients[username] = [];
        }
        clients[username].push(socket.id);
        console.log(`✅ ${username} connected with socket ID ${socket.id}`);
        console.log("Current clients:", clients);
        socket.emit("connect-response", { success: true, username });
        broadcastUserList();
    });

    socket.on("message", async (data) => {
        try {
            const response = await axios.post('https://chat-x-2-3-1.onrender.com/predict', { message: data.message });
            if (response.data.prediction === 'spam') {
                socket.emit("error", "Message detected as spam or abuse and was blocked.");
                return;
            }
        } catch (err) {
            console.error("Spam detection API error:", err);
        }

        const timestamp = new Date();
        const result = sentiment.analyze(data.message);
        let mood = "neutral";
        if (result.score > 2) mood = "happy";
        else if (result.score < -2) mood = "sad";
        else if (result.score < 0) mood = "angry";

        const payload = {
            sender: data.sender,
            recipient: data.recipient,
            message: data.message,
            timestamp: timestamp.toLocaleString(),
            mood: mood
        };

        try {
            await User.updateOne(
                { username: data.sender, "messages.with": data.recipient },
                { $addToSet: { contacts: data.recipient }, $push: { "messages.$.chat": { sender: data.sender, message: data.message, timestamp } } }
            );
            await User.updateOne(
                { username: data.sender, "messages.with": { $ne: data.recipient } },
                { $addToSet: { contacts: data.recipient }, $push: { messages: { with: data.recipient, chat: [{ sender: data.sender, message: data.message, timestamp }] } } }
            );
            await User.updateOne(
                { username: data.recipient, "messages.with": data.sender },
                { $addToSet: { contacts: data.sender }, $push: { "messages.$.chat": { sender: data.sender, message: data.message, timestamp } } }
            );
            await User.updateOne(
                { username: data.recipient, "messages.with": { $ne: data.sender } },
                { $addToSet: { contacts: data.sender }, $push: { messages: { with: data.sender, chat: [{ sender: data.sender, message: data.message, timestamp }] } } }
            );
        } catch (err) {
            console.error("❌ MongoDB chat save error:", err);
        }

        const recipientSocketIds = clients[data.recipient];
        if (recipientSocketIds) {
            recipientSocketIds.forEach(socketId => {
                io.to(socketId).emit("message", payload);
            });
        }
    });

    socket.on("typing", (data) => {
        const recipientSocketIds = clients[data.recipient];
        if (recipientSocketIds) {
            recipientSocketIds.forEach(socketId => {
                io.to(socketId).emit("typing", { sender: data.sender });
            });
        }
    });

    socket.on("join-room", ({ room }) => {
        socket.join(room);
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        if (roomSize > 1) {
            socket.to(room).emit("peer-joined", { peerId: socket.id, initiator: true });
        }
    });

    socket.on("signal", ({ signal, room }) => {
        socket.to(room).emit("signal", { signal });
    });


    socket.on("disconnect", () => {
        if (username && clients[username]) {
            clients[username] = clients[username].filter(id => id !== socket.id);
            if (clients[username].length === 0) {
                delete clients[username];
            }
            console.log(`🔌 ${username} disconnected`);
            console.log("Current clients:", clients);
            broadcastUserList();
        }
    });
});

function broadcastUserList() {
    const users = Object.keys(clients);
    console.log(`Broadcasting user list: ${users}`);
    io.emit("updateUsers", users);
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
    console.log(`🚀 Server (HTTP + Socket.IO) running on port ${PORT}`);
});
