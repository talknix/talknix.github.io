// Wait until DOM is fully loaded before adding event listeners
document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("generateBtn").addEventListener("click", generateCode);
    document.getElementById("joinBtn").addEventListener("click", joinChat);
    document.getElementById("sendBtn").addEventListener("click", sendMessage);
});

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCiN7DLtxTHncqYGy0hGCFao9TCAu2Z4mo",
    authDomain: "talknix-p2p.firebaseapp.com",
    databaseURL: "https://talknix-p2p-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "talknix-p2p",
    storageBucket: "talknix-p2p.firebasestorage.app",
    messagingSenderId: "1091516076156",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let localConnection, remoteConnection;
let dataChannel;

// Function to generate a unique 7-digit code only once per session
function generateCode() {
    let existingCode = localStorage.getItem("chatCode");
    if (!existingCode) {
        let code = Math.floor(1000000 + Math.random() * 9000000); // Generate a 7-digit code
        localStorage.setItem("chatCode", code); // Store in localStorage
        document.getElementById("codeInput").value = code; // Display the code
    } else {
        document.getElementById("codeInput").value = existingCode; // Reuse existing code
    }
}


// Function to join chat (setup WebRTC)
async function joinChat() {
    let code = document.getElementById("codeInput").value;
    if (code.length !== 7) {
        alert("Please enter a valid 7-digit code!");
        return;
    }

    localConnection = new RTCPeerConnection();
    dataChannel = localConnection.createDataChannel("chat");

    dataChannel.onmessage = (event) => displayMessage("Peer", event.data);
    dataChannel.onopen = () => console.log("Data channel opened");
    dataChannel.onclose = () => console.log("Data channel closed");

    localConnection.onicecandidate = (event) => {
        if (event.candidate) {
            database.ref("chats/" + code + "/ice").push(event.candidate);
        }
    };

    let offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    database.ref("chats/" + code).set({ offer });

    database.ref("chats/" + code + "/answer").on("value", async (snapshot) => {
        if (snapshot.exists()) {
            let answer = snapshot.val();
            await localConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    database.ref("chats/" + code + "/ice").on("child_added", async (snapshot) => {
        let candidate = snapshot.val();
        await localConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    alert("Waiting for peer to join...");
}

// Function to accept connection
async function acceptChat() {
    let code = document.getElementById("codeInput").value;
    if (code.length !== 7) {
        alert("Please enter a valid 7-digit code!");
        return;
    }

    remoteConnection = new RTCPeerConnection();
    remoteConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onmessage = (e) => displayMessage("Peer", e.data);
    };

    remoteConnection.onicecandidate = (event) => {
        if (event.candidate) {
            database.ref("chats/" + code + "/ice").push(event.candidate);
        }
    };

    let snapshot = await database.ref("chats/" + code + "/offer").once("value");
    if (!snapshot.exists()) {
        alert("No active chat found for this code!");
        return;
    }

    let offer = snapshot.val();
    await remoteConnection.setRemoteDescription(new RTCSessionDescription(offer));

    let answer = await remoteConnection.createAnswer();
    await remoteConnection.setLocalDescription(answer);

    database.ref("chats/" + code + "/answer").set(answer);
}

// Function to send messages
function sendMessage() {
    let message = document.getElementById("messageInput").value;
    if (message.trim() !== "" && dataChannel.readyState === "open") {
        dataChannel.send(message);
        displayMessage("You", message);
        document.getElementById("messageInput").value = ""; // Clear input
    }
}

// Function to display messages in chat
function displayMessage(sender, message) {
    let messageBox = document.getElementById("messages");
    let newMessage = document.createElement("div");
    newMessage.textContent = sender + ": " + message;
    messageBox.appendChild(newMessage);
}
