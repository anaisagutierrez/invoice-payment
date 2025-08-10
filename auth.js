// auth.js
import { auth } from './firebaseConfig.js';

const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authButton = document.getElementById('auth-button');
const statusMessageDiv = document.getElementById('status-message');

function showStatusMessage(message, type = 'info') {
  statusMessageDiv.textContent = message;
  statusMessageDiv.className = 'p-3 mb-4 text-sm rounded-lg text-center';
  if (type === 'success') {
    statusMessageDiv.classList.add('bg-green-100', 'text-green-700');
  } else if (type === 'error') {
    statusMessageDiv.classList.add('bg-red-100', 'text-red-700');
  } else {
    statusMessageDiv.classList.add('bg-blue-100', 'text-blue-700');
  }
  statusMessageDiv.style.display = 'block';
}

function clearStatusMessage() {
  statusMessageDiv.style.display = 'none';
}

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearStatusMessage();
  authButton.disabled = true;
  authButton.textContent = 'Logging in...';

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showStatusMessage('Email and password are required.', 'error');
    authButton.disabled = false;
    authButton.textContent = 'Login';
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showStatusMessage('Login successful! Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    let errorMessage = 'Login failed. Please try again.';
    if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      errorMessage = 'Invalid email or password.';
    }
    showStatusMessage(errorMessage, 'error');
  } finally {
    authButton.disabled = false;
    authButton.textContent = 'Login';
  }
});

// Redirect if already logged in
auth.onAuthStateChanged(user => {
  if (user) {
    window.location.href = 'index.html';
  }
});

export { auth };
