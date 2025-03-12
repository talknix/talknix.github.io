// Firebase Config (Replace with your Firebase details)
const firebaseConfig = {
  apiKey: "AIzaSyCiN7DLtxTHncqYGy0hGCFao9TCAu2Z4mo",
  authDomain: "talknix-p2p.firebaseapp.com",
  databaseURL: "https://talknix-p2p-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "talknix-p2p",
  storageBucket: "talknix-p2p.firebasestorage.app",
  messagingSenderId: "1091516076156",
  appId: "1:1091516076156:web:09337436dcc867760279f9",
 
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const peer = new RTCPeerConnection();

// Function to generate a 7-digit random ID
function generateID() {
    return Math.floor(1000000 + Math.random() * 9000000).toString();
}

// Function to create connection and store SDP/ICE
async function createConnection() {
    const connectionID = generateID();
    alert("Your connection ID: " + connectionID);
    document.getElementById("connectionID").innerText = connectionID; // Display ID

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    db.ref("connections/" + connectionID).set({
        sdp: offer.sdp
    });

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            db.ref("connections/" + connectionID + "/ice").push(event.candidate);
        }
    };
}

// Function to join connection using 7-digit ID
async function joinConnection() {
    const connectionID = document.getElementById("joinCode").value;
    const data = await db.ref("connections/" + connectionID).get();
    if (!data.exists()) return alert("Invalid code!");

    const remoteSDP = new RTCSessionDescription({ type: "offer", sdp: data.val().sdp });
    await peer.setRemoteDescription(remoteSDP);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    db.ref("connections/" + connectionID + "/answer").set(answer.sdp);

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            db.ref("connections/" + connectionID + "/ice").push(event.candidate);
        }
    };
}
