// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCiN7DLtxTHncqYGy0hGCFao9TCAu2Z4mo",
    authDomain: "talknix-p2p.firebaseapp.com",
    databaseURL: "https://talknix-p2p-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "talknix-p2p",
    storageBucket: "talknix-p2p.firebasestorage.app",
    messagingSenderId: "1091516076156"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
console.log("Firebase initialized successfully");
const db = firebase.database();

// Global variables
let pc = null; // RTCPeerConnection
let dataChannel = null; // RTCDataChannel
let currentCode = null; // Track the current chat code
const IPINFO_TOKEN = "dc56d91e24459d"; // Your ipinfo.io token

// DOM Elements
const chatCodeInput = document.getElementById("chat-code");
const generateCodeBtn = document.getElementById("generate-code");
const joinChatBtn = document.getElementById("join-chat");
const messageInput = document.getElementById("message-input");
const sendMessageBtn = document.getElementById("send-message");
const clearChatBtn = document.getElementById("clear-chat");
const messagesDiv = document.getElementById("messages");
const statusDiv = document.getElementById("status");

// Generate 7-digit unique code
async function generateCode() {
    try {
        console.log("Fetching IP info...");
        const response = await fetch(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`);
        console.log("Response status:", response.status);
        if (!response.ok) throw new Error("Failed to fetch IP info");
        const ipInfo = await response.json();
        console.log("IP Info:", ipInfo);
        
        const country = ipInfo.country || "XX";
        const region = ipInfo.region || "Unknown";
        const isp = ipInfo.org || "UnknownISP";
        const timestamp = Date.now().toString();
        
        const strToHash = country + region + isp + timestamp;
        console.log("String to hash:", strToHash);
        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(strToHash));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
        const hashBigInt = BigInt("0x" + hashHex);
        
        const code = ((hashBigInt % 9000000n) + 1000000n).toString();
        console.log("Generated code:", code);
        return code;
    } catch (error) {
        console.error("Error generating code:", error);
        let errorMessage = "Failed to generate code. ";
        if (error.message.includes("Failed to fetch")) {
            errorMessage += "Unable to fetch IP info. Check your network or API token.";
        } else {
            errorMessage += "Check console for details.";
        }
        alert(errorMessage);
        return null;
    }
}

// Display messages in chat window
function displayMessage(message) {
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
}

// Create a new chat (Offerer)
async function createNewChat(code) {
    if (pc) pc.close(); // Close any existing connection
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            // Add a TURN server if needed (requires setup)
            // { urls: "turn:your.turn.server:3478", username: "user", credential: "password" }
        ]
    });
    
    // Create data channel for messaging
    dataChannel = pc.createDataChannel("chat");
    dataChannel.onopen = () => {
        console.log("Data channel opened");
        statusDiv.textContent = "Status: Connected";
    };
    dataChannel.onmessage = (event) => displayMessage(`Peer: ${event.data}`);
    dataChannel.onerror = (error) => console.error("Data channel error:", error);
    
    // Generate and store SDP offer
    console.log("Creating offer...");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("Offer created, setting in Firebase...");
    await db.ref(`chats/${code}/offer`).set(JSON.stringify(offer));
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("Sending ICE candidate...");
            db.ref(`chats/${code}/ice`).push().set(JSON.stringify(event.candidate));
        }
    };
    
    // Listen for answer from joiner
    db.ref(`chats/${code}/answer`).on("value", async (snapshot) => {
        if (snapshot.exists() && pc.signalingState !== "stable") {
            console.log("Received answer, setting remote description...");
            const answer = JSON.parse(snapshot.val());
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    
    // Listen for ICE candidates from joiner
    db.ref(`chats/${code}/ice`).on("child_added", async (snapshot) => {
        const candidate = JSON.parse(snapshot.val());
        console.log("Received ICE candidate...");
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error("ICE candidate error:", err));
    });

    // Wait for ICE gathering to complete (optional delay)
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for ICE candidates
}

// Join an existing chat (Answerer)
async function joinExistingChat(code) {
    if (pc) pc.close(); // Close any existing connection
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            // { urls: "turn:your.turn.server:3478", username: "user", credential: "password" }
        ]
    });
    
    // Fetch and set remote offer
    console.log("Fetching offer from Firebase...");
    const offerSnapshot = await db.ref(`chats/${code}/offer`).once("value");
    if (!offerSnapshot.exists()) {
        alert("No chat found with this code");
        return;
    }
    
    const offer = JSON.parse(offerSnapshot.val());
    console.log("Setting remote offer...");
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create and store answer
    console.log("Creating answer...");
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log("Setting answer in Firebase...");
    await db.ref(`chats/${code}/answer`).set(JSON.stringify(answer));
    
    // Handle data channel from offerer
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => {
            console.log("Data channel opened");
            statusDiv.textContent = "Status: Connected";
        };
        dataChannel.onmessage = (event) => displayMessage(`Peer: ${event.data}`);
        dataChannel.onerror = (error) => console.error("Data channel error:", error);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("Sending ICE candidate...");
            db.ref(`chats/${code}/ice`).push().set(JSON.stringify(event.candidate));
        }
    };
    
    // Listen for ICE candidates from offerer
    db.ref(`chats/${code}/ice`).on("child_added", async (snapshot) => {
        const candidate = JSON.parse(snapshot.val());
        console.log("Received ICE candidate...");
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error("ICE candidate error:", err));
    });

    // Wait for ICE gathering to complete (optional delay)
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for ICE candidates
}

// Send message via data channel
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    if (!dataChannel || dataChannel.readyState !== "open") {
        console.log("Waiting for connection, state:", dataChannel ? dataChannel.readyState : "Not initialized");
        statusDiv.textContent = "Status: Connecting...";
        setTimeout(() => sendMessage(), 1000); // Retry after 1 second
        return;
    }
    dataChannel.send(message);
    displayMessage(`You: ${message}`);
    messageInput.value = "";
    statusDiv.textContent = "Status: Connected";
}

// Clear chat messages
function clearChat() {
    messagesDiv.innerHTML = "";
    statusDiv.textContent = "Status: Not Connected";
    if (pc) {
        pc.close();
        pc = null;
        dataChannel = null;
        currentCode = null;
        generateCodeBtn.disabled = false;
        // Optionally clear Firebase data
        if (currentCode) db.ref(`chats/${currentCode}`).remove();
    }
}

// Event Listeners
generateCodeBtn.addEventListener("click", async () => {
    if (currentCode) {
        alert("A chat is already active. Please clear the chat or use a new session.");
        return;
    }
    generateCodeBtn.disabled = true;
    generateCodeBtn.classList.add("loading");
    const code = await generateCode();
    if (code) {
        currentCode = code;
        chatCodeInput.value = code;
        await createNewChat(code);
        alert(`Chat created! Share this code: ${code}`);
    }
    generateCodeBtn.disabled = false;
    generateCodeBtn.classList.remove("loading");
});

joinChatBtn.addEventListener("click", async () => {
    const code = chatCodeInput.value.trim();
    if (!/^\d{7}$/.test(code)) {
        alert("Please enter a valid 7-digit code");
        return;
    }
    if (currentCode) {
        alert("A chat is already active. Please clear the chat first.");
        return;
    }
    currentCode = code;
    joinChatBtn.disabled = true;
    await joinExistingChat(code);
    joinChatBtn.disabled = false;
});

sendMessageBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

clearChatBtn.addEventListener("click", clearChat);
