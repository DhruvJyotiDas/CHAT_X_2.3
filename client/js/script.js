let socket;
let username;
let authToken;
let selectedRecipient = null;
let localStream;
let peerConnection;

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'turn:serveo.net:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};

// DOM Elements
const callBtn = document.getElementById("call-btn");
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

const API_BASE_URL = window.location.origin;

window.onload = async function () {
  username = localStorage.getItem("username");
  const password = localStorage.getItem("password");

  if (!username || !password) {
    alert("Login info not found. Redirecting to login page.");
    window.location.href = "login.html";
    return;
  }

  document.querySelector(".welcome").textContent = `Welcome, ${username}`;

  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    authToken = data.token || "dummy-token";
    connectWebSocket();
  } catch (err) {
    alert("Login failed or session expired.");
    window.location.href = "login.html";
  }
};

function connectWebSocket() {
  socket = new WebSocket("wss://chat-x-2-3-1.onrender.com");

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "connect", username, token: authToken }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "error" && data.message.toLowerCase().includes("spam")) {
      showNotification("Spam detected: Your message was blocked.");
      return;
    }
    handleSocketMessage(event);
  };

  socket.onerror = () => alert("WebSocket error.");
  socket.onclose = () => console.warn("WebSocket disconnected");

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
}

async function handleSocketMessage(event) {
  const data = JSON.parse(event.data);
  if (data.type === "updateUsers") {
    const container = document.getElementById("user-items-container");
    container.innerHTML = "";
    data.users.forEach(user => {
      if (user !== username) {
        const el = document.createElement("div");
        el.className = "user-item";
        el.textContent = user;
        el.onclick = async () => {
          selectedRecipient = user;
          document.getElementById("chat-title").textContent = user;
          document.getElementById("chat-box").innerHTML = "";
          const res = await fetch(`${API_BASE_URL}/history?user=${username}&peer=${user}`);
          const messages = await res.json();
          messages.forEach(renderMessage);
        };
        container.appendChild(el);
      }
    });
  }

  else if (data.type === "call-request") {
    incomingCallPopup.classList.remove("hidden");
    incomingCallText.textContent = `${data.from} is calling you...`;

    acceptCallBtn.onclick = async () => {
      incomingCallPopup.classList.add("hidden");
      socket.send(JSON.stringify({
        type: "call-accepted",
        from: username,
        to: data.from
      }));
      await startWebRTCCall(true);
    };

    declineCallBtn.onclick = () => {
      incomingCallPopup.classList.add("hidden");
      socket.send(JSON.stringify({
        type: "call-declined",
        from: username,
        to: data.from
      }));
      callBtn.style.display = "inline-block";
    };
  }

  else if (data.type === "call-accepted") {
    await startWebRTCCall(false);
  }

  else if (data.type === "call-offer") {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({
      type: "call-answer",
      answer: answer,
      from: username,
      to: data.from
    }));
  }

  else if (data.type === "call-answer") {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  else if (data.type === "call-candidate") {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }

  else if (data.type === "message") {
    updateEmoji(data.mood);
    renderMessage(data);
  }

  else if (data.type === "typing") {
    showTypingIndicator(data.sender);
    updateEmoji("neutral");
  }
}

async function startWebRTCCall(isCaller) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
        socket.send(JSON.stringify({
          type: "call-candidate",
          candidate: event.candidate,
          from: username,
          to: selectedRecipient
        }));
      }
    };

    if (isCaller) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.send(JSON.stringify({
        type: "call-offer",
        offer: offer,
        from: username,
        to: selectedRecipient
      }));
    }

    videoCallUI.style.display = "flex";
    callBtn.style.display = "none";

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
  callBtn.style.display = "inline-block";
});

callBtn.onclick = () => {
  if (!selectedRecipient) return alert("Select a user first.");
  socket.send(JSON.stringify({
    type: "call-request",
    from: username,
    to: selectedRecipient
  }));
  callBtn.style.display = "none";
};

function updateEmoji(mood) {
  const emojiMap = { happy: "😄", sad: "😢", angry: "😠", neutral: "😐" };
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
  socket.send(JSON.stringify(payload));
  renderMessage(payload);
  messageInput.value = "";
});

messageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
  else if (selectedRecipient) {
    socket.send(JSON.stringify({
      type: "typing",
      sender: username,
      recipient: selectedRecipient
    }));
  }
});

function renderMessage({ sender, message, timestamp }) {
  const templateId = sender === username ? "message-template-sent" : "message-template-received";
  const template = document.getElementById(templateId);
  const clone = template.content.cloneNode(true);
  const contentEl = clone.querySelector(".content");
  contentEl.textContent = message;
  if (sender !== username) clone.querySelector(".sender").textContent = sender;
  const time = new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  clone.querySelector(".meta").textContent = time;
  const box = document.getElementById("chat-box");
  box.appendChild(clone);
  box.scrollTop = box.scrollHeight;
}
