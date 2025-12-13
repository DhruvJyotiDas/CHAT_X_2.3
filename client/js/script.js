let socket;
let username;
let authToken;
let selectedRecipient = null;
let localStream;
let peerConnection;
let room;

const configuration = {
    iceServers: [{
        urls: "stun:stun.l.google.com:19302"
    }],
};

const userIcons = ['images/bot-icon.png', 'images/group-icon.png'];

// DOM Elements
const incomingCallPopup = document.getElementById("incoming-call-popup");
const incomingCallText = document.getElementById("incoming-call-text");
const acceptCallBtn = document.getElementById("accept-call-btn");
const declineCallBtn = document.getElementById("decline-call-btn");
const videoCallUI = document.querySelector(".video-call-ui");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const endCallBtn = document.getElementById("end-call-btn");

console.log("✅ script.js loaded!");

// Emoji Picker
const emojiPicker = document.createElement("div");
emojiPicker.id = "emoji-picker";
emojiPicker.style.position = "absolute";
emojiPicker.style.background = "#fff";
emojiPicker.style.border = "1px solid #ccc";
emojiPicker.style.padding = "5px";
emojiPicker.style.borderRadius = "5px";
emojiPicker.style.display = "none";
emojiPicker.style.zIndex = "1000";
document.body.appendChild(emojiPicker);

const emojis = ["😀", "😂", "😍", "😢", "😠", "😐", "👍", "🙏", "🎉", "❤️", "😎", "🤔"];
emojis.forEach(emoji => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.style.fontSize = "20px";
    btn.style.margin = "2px";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
        messageInput.value += emoji;
        messageInput.focus();
        emojiPicker.style.display = "none";
    });
    emojiPicker.appendChild(btn);
});

const emojiBtn = document.getElementById("emoji-btn");
emojiBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = emojiBtn.getBoundingClientRect();
    emojiPicker.style.left = `${rect.left}px`;
    emojiPicker.style.top = `${rect.top - emojiPicker.offsetHeight - 10}px`;
    emojiPicker.style.display = emojiPicker.style.display === "none" ? "block" : "none";
});
document.addEventListener("click", () => emojiPicker.style.display = "none");

const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "https://dj7.duckdns.org"
    : window.location.origin;


window.onload = async function() {
    username = sessionStorage.getItem("username");
    const password = sessionStorage.getItem("password");

    if (!username || !password) {
        alert("Login info not found. Redirecting to login page.");
        window.location.href = "login.html";
        return;
    }

    document.querySelector(".welcome").textContent = `Welcome, ${username}`;

    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");

        authToken = data.token || "dummy-token";
        connectSocketIO();
    } catch (err) {
        alert("Login failed or session expired.");
        window.location.href = "login.html";
    }
};

function connectSocketIO() {
    console.log("connectSocketIO() CALLED");
    socket = io("https://dj7.duckdns.org", {
        path: "/socket.io"
    });

    socket.on("connect", () => {
        console.log("SOCKET CONNECTED, emitting connect-user", username);
        socket.emit("connect-user", { username });
    });

    socket.on("error", (error) => {
        if (error.toLowerCase().includes("spam")) {
            showNotification("Spam detected: Your message was blocked.");
        } else {
            alert("Socket.IO error.");
        }
    });

    socket.on("disconnect", () => console.warn("Socket.IO disconnected"));

    socket.on("updateUsers", (users) => {
        console.log("Received user list:", users);
        const userGrid = document.getElementById('user-grid');
        const userCardTemplate = document.getElementById('user-card-template');
        userGrid.innerHTML = ""; // Clear existing users
        users.forEach(user => {
            if (user !== username) {
                const card = userCardTemplate.content.cloneNode(true);
                card.querySelector('.user-name').textContent = user;
                // Randomize user icon
                const randomIcon = userIcons[Math.floor(Math.random() * userIcons.length)];
                card.querySelector('.user-icon').src = randomIcon;

                card.querySelector('.user-card').onclick = async () => {
                    selectedRecipient = user;
                    document.getElementById('chat-title').textContent = `Chat with ${user}`;
                    document.getElementById('chat-box').innerHTML = "";

                    // Fetch chat history
                    const res = await fetch(`${API_BASE_URL}/history?user=${username}&peer=${user}`);
                    const messages = await res.json();
                    messages.forEach(renderMessage);

                    document.getElementById('chat-modal').classList.remove('hidden');
                };
                userGrid.appendChild(card);
            }
        });
    });
    
    document.getElementById('close-chat-btn').onclick = () => {
        document.getElementById('chat-modal').classList.add('hidden');
        selectedRecipient = null;
    };


    socket.on("peer-joined", async ({
        peerId,
        initiator
    }) => {
        if (initiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit("signal", {
                signal: {
                    type: "offer",
                    sdp: offer
                },
                room
            });
        }
    });

    socket.on("signal", async ({
        signal
    }) => {
        if (signal.type === "offer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("signal", {
                signal: {
                    type: "answer",
                    sdp: answer
                },
                room
            });
        } else if (signal.type === "answer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    });


    socket.on("message", (data) => {
        updateEmoji(data.mood);
        renderMessage(data);
    });

    socket.on("typing", (data) => {
        showTypingIndicator(data.sender);
        updateEmoji("neutral");
    });
}

async function startWebRTCCall(callType) {
    try {
        document.getElementById('local-video-username').textContent = username;
        document.getElementById('remote-video-username').textContent = selectedRecipient;

        const constraints = {
            video: callType === 'video',
            audio: true
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("signal", {
                    signal: {
                        candidate: event.candidate
                    },
                    room
                });
            }
        };

        room = [username, selectedRecipient].sort().join("-");
        socket.emit("join-room", {
            room
        });

        videoCallUI.style.display = "flex";
    } catch (err) {
        console.error("WebRTC call error:", err);
    }
}

endCallBtn.addEventListener("click", () => {
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    videoCallUI.style.display = "none";
});

// Mute button functionality
const muteBtn = document.getElementById("mute-btn");
let isMuted = false;

muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    muteBtn.textContent = isMuted ? "Unmute" : "Mute";
});

// Draggable video call UI
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;

videoCallUI.addEventListener("mousedown", (e) => {
    if (e.target === muteBtn || e.target === endCallBtn) return; // Ignore clicks on buttons
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = videoCallUI.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    videoCallUI.style.transition = "none";
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    videoCallUI.style.left = initialX + deltaX + "px";
    videoCallUI.style.top = initialY + deltaY + "px";
});

document.addEventListener("mouseup", () => {
    if (isDragging) {
        isDragging = false;
        videoCallUI.style.transition = "";
    }
});


function initiateCall(callType) {
    if (!selectedRecipient) return alert("Select a user first.");
    startWebRTCCall(callType);
}

document.getElementById('voice-call-btn').onclick = () => initiateCall('audio');
document.getElementById('video-call-btn').onclick = () => initiateCall('video');


function updateEmoji(mood) {
    const emojiMap = {
        happy: "😄",
        sad: "😢",
        angry: "😠",
        neutral: "😐"
    };
    document.getElementById("live-emoji").textContent = emojiMap[mood] || "😐";
}

function showTypingIndicator(sender) {
    const id = `typing-${sender}`;
    if (document.getElementById(id)) return;
    const el = document.createElement("div");
    el.id = id;
    el.className = "message status";
    el.textContent = `${sender} is typing...`;
    document.getElementById("chat-box").appendChild(el);
    setTimeout(() => document.getElementById(id)?.remove(), 3000);
}

const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message");

sendBtn?.addEventListener("click", () => {
    const msg = messageInput.value.trim();
    if (!msg || !selectedRecipient) return;
    const payload = {
        type: "message",
        sender: username,
        recipient: selectedRecipient,
        message: msg,
        timestamp: Date.now()
    };
    socket.emit("message", payload);
    renderMessage(payload);
    messageInput.value = "";
});

messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
    else if (selectedRecipient) {
        socket.emit("typing", {
            sender: username,
            recipient: selectedRecipient
        });
    }
});

function renderMessage({
    sender,
    message,
    timestamp
}) {
    const templateId = sender === username ? "message-template-sent" : "message-template-received";
    const template = document.getElementById(templateId);
    const clone = template.content.cloneNode(true);
    const contentEl = clone.querySelector(".content");
    contentEl.textContent = message;
    if (sender !== username) clone.querySelector(".sender").textContent = sender;
    const time = new Date(timestamp || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
    clone.querySelector(".meta").textContent = time;
    const box = document.getElementById("chat-box");
    box.appendChild(clone);
    box.scrollTop = box.scrollHeight;
}

function showNotification(message) {
    const container = document.getElementById("notification-container");
    if (!container) return;
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => notification.classList.add("hide"), 2000);
    setTimeout(() => container.removeChild(notification), 3000);
}