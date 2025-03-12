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
let pc; // RTCPeerConnection
let dataChannel; // RTCDataChannel
const IPINFO_TOKEN = "dc56d91e24459d"; // Your ipinfo.io token

// DOM Elements
const chatCodeInput = document.getElementById("chat-code");
const generateCodeBtn = document.getElementById("generate-code");
const joinChatBtn = document.getElementById("join-chat");
const messageInput = document.getElementById("message-input");
const sendMessageBtn = document.getElementById("send-message");
const messagesDiv = document.getElementById("messages");

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
        alert("Failed to generate code. Check console for details.");
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
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" } // Add STUN server for better connectivity
        ]
    });
    
    // Create data channel for messaging
    dataChannel = pc.createDataChannel("chat");
    dataChannel.onopen = () => console.log("Data channel opened");
    dataChannel.onmessage = (event) => displayMessage(`Peer: ${event.data}`);
    
    // Generate and store SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await db.ref(`chats/${code}/offer`).set(JSON.stringify(offer));
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            db.ref(`chats/${code}/ice`).push().set(JSON.stringify(event.candidate));
        }
    };
    
    // Listen for answer from joiner
    db.ref(`chats/${code}/answer`).on("value", async (snapshot) => {
        if (snapshot.exists() && pc.signalingState !== "stable") {
            const answer = JSON.parse(snapshot.val());
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    
    // Listen for ICE candidates from joiner
    db.ref(`chats/${code}/ice`).on("child_added", async (snapshot) => {
        const candidate = JSON.parse(snapshot.val());
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
}

// Join an existing chat (Answerer)
async function joinExistingChat(code) {
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" } // Add STUN server for better connectivity
        ]
    });
    
    // Fetch and set remote offer
    const offerSnapshot = await db.ref(`chats/${code}/offer`).once("value");
    if (!offerSnapshot.exists()) {
        alert("No chat found with this code");
        return;
    }
    
    const offer = JSON.parse(offerSnapshot.val());
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create and store answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await db.ref(`chats/${code}/answer`).set(JSON.stringify(answer));
    
    // Handle data channel from offerer
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onmessage = (event) => displayMessage(`Peer: ${event.data}`);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            db.ref(`chats/${code}/ice`).push().set(JSON.stringify(event.candidate));
        }
    };
    
    // Listen for ICE candidates from offerer
    db.ref(`chats/${code}/ice`).on("child_added", async (snapshot) => {
        const candidate = JSON.parse(snapshot.val());
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
}

// Send message via data channel
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
        displayMessage(`You: ${message}`);
        messageInput.value = "";
    } else if (!dataChannel || dataChannel.readyState !== "open") {
        alert("Chat connection not established yet");
    }
}

// Event Listeners
generateCodeBtn.addEventListener("click", async () => {
    const code = await generateCode();
    if (code) {
        chatCodeInput.value = code;
        await createNewChat(code);
        alert(`Chat created! Share this code: ${code}`);
    }
});

joinChatBtn.addEventListener("click", async () => {
    const code = chatCodeInput.value.trim();
    if (!/^\d{7}$/.test(code)) {
        alert("Please enter a valid 7-digit code");
        return;
    }
    await joinExistingChat(code);
});

sendMessageBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});
