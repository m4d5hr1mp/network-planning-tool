// js/core/firebase.js
const firebaseConfig = {
    apiKey: "AIzaSyBwoN9AUf9LjmIN4SxKs8OmDuxPqUqzABI",
    authDomain: "ac-network-planning-tool.firebaseapp.com",
    projectId: "ac-network-planning-tool",
    storageBucket: "ac-network-planning-tool.firebasestorage.app",
    messagingSenderId: "859250295233",
    appId: "1:859250295233:web:7dd4b2753981bcbc796f40"
};

export const PASSPHRASE_HASH = "30aa775ccf5a6e6637614eb4da9b2427c751f5a06a883eeffec3be400d81fb0b";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

export const db   = firebase.firestore();
export const auth = firebase.auth();

// Anonymous sessions persist in localStorage by default.
// Token lasts ~1 hour, auto-refreshed while tab is open.
// On expiry the auth guard in app.js re-triggers signInAnonymously.