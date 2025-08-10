// 🔥 Your web app's Firebase configuration

const firebaseConfig = {
    apiKey: "AIzaSyB1LCgmA9eb1tNsmdmQTuHPhRKhet4RaWM",
    authDomain: "language-entry.firebaseapp.com",
    projectId: "language-entry",
    storageBucket: "language-entry.firebasestorage.app",
    messagingSenderId: "72772945167",
    appId: "1:72772945167:web:3a6f9d2c3e2083952daa7a"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authButton = document.getElementById('auth-button');
const formTitle = document.getElementById('form-title');
const statusMessageDiv = document.getElementById('status-message');

function showStatusMessage(message, type = 'info') {
    statusMessageDiv.textContent = message;
    statusMessageDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'text-green-700', 'text-red-700');
    if (type === 'success') {
        statusMessageDiv.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        statusMessageDiv.classList.add('bg-red-100', 'text-red-700');
    }
}

function clearStatusMessage() {
    statusMessageDiv.classList.add('hidden');
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatusMessage();

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'index.html';
    } catch (error) {
        let errorMessage = error.message;
        if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password. Please try again.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        }
        showStatusMessage(`Error: ${errorMessage}`, 'error');
    }
});

// The toggleFormLink and the associated event listener have been removed.
// The form now only handles login.

auth.onAuthStateChanged(user => {
    if (user) {
        // User is logged in, redirect to the main page
        window.location.href = 'index.html';
    }
});