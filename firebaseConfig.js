// firebaseConfig.js
// Firebase config and initialization

const firebaseConfig = {
  apiKey: "AIzaSyB1LCgmA9eb1tNsmdmQTuHPhRKhet4RaWM",
  authDomain: "language-entry.firebaseapp.com",
  projectId: "language-entry",
  storageBucket: "language-entry.firebasestorage.app",
  messagingSenderId: "72772945167",
  appId: "1:72772945167:web:3a6f9d2c3e2083952daa7a"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

export { auth, db };
