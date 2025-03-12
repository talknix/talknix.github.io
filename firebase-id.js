import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration (Replace with your Firebase credentials)
const firebaseConfig = {
    apiKey: "AIzaSyCiN7DLtxTHncqYGy0hGCFao9TCAu2Z4mo",
    authDomain: "talknix-p2p.firebaseapp.com",
    projectId: "talknix-p2p",
    storageBucket: "talknix-p2p.firebasestorage.app",
    messagingSenderId: "1091516076156",
    appId: "1:1091516076156:web:09337436dcc867760279f9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to Fetch User's Country, Region, and ISP
async function getUserLocation() {
    let response = await fetch('https://ipapi.co/json/');
    let data = await response.json();
    return {
        country: data.country_code,  // Example: "IN" for India
        region: data.region_code,    // Example: "KA" for Karnataka
        isp: data.org.replace(/\s+/g, '').substring(0, 3) // First 3 characters of ISP
    };
}

// Function to Generate a Unique 7-Digit ID
async function generateID() {
    let location = await getUserLocation();
    let randomNum = Math.floor(100 + Math.random() * 900); // Random 3-digit number
    let uniqueID = `${location.country}${location.region}${location.isp}${randomNum}`.substring(0, 7); // Ensure 7 chars

    console.log("Generated ID:", uniqueID);
    return uniqueID;
}

// Function to Store ID in Firebase Firestore
async function storeID(userID) {
    let id = await generateID();
    await setDoc(doc(db, "users", userID), { id: id });
    console.log("Stored ID in Firestore:", id);
}

// Function to Retrieve Stored ID
async function getStoredID(userID) {
    let docRef = doc(db, "users", userID);
    let docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        console.log("Retrieved ID:", docSnap.data().id);
        return docSnap.data().id;
    } else {
        console.log("No ID found for this user.");
        return null;
    }
}

// Run Script Automatically (Change 'user123' to any unique identifier)
storeID("user123");
