// ui.js
import { auth, db } from './firebaseConfig.js';

const logoutBtn = document.getElementById('logout-btn');
const adminToggle = document.getElementById('admin-toggle');
const createUserBtn = document.getElementById('create-user-btn');
const createUserModal = document.getElementById('create-user-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const createUserForm = document.getElementById('create-user-form');
const modalStatusMessage = document.getElementById('modal-status-message');
const dataContainer = document.getElementById('data-container');

function showModalMessage(message, type = 'info') {
  modalStatusMessage.textContent = message;
  modalStatusMessage.className = 'p-3 mb-4 text-sm rounded-lg text-center';
  if (type === 'success') {
    modalStatusMessage.classList.add('bg-green-100', 'text-green-700');
  } else if (type === 'error') {
    modalStatusMessage.classList.add('bg-red-100', 'text-red-700');
  } else {
    modalStatusMessage.classList.add('bg-blue-100', 'text-blue-700');
  }
  modalStatusMessage.style.display = 'block';
}

function clearModalMessage() {
  modalStatusMessage.style.display = 'none';
}

logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'login.html';
});

adminToggle.addEventListener('change', () => {
  createUserBtn.style.display = adminToggle.checked ? 'inline-block' : 'none';
});

createUserBtn.addEventListener('click', () => {
  createUserModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
  createUserModal.classList.add('hidden');
  clearModalMessage();
});

createUserForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearModalMessage();

  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;

  if (!email || !password) {
    showModalMessage('Email and password are required.', 'error');
    return;
  }

  try {
    await auth.createUserWithEmailAndPassword(email, password);
    showModalMessage('User created successfully!', 'success');
    createUserForm.reset();
    setTimeout(() => {
      createUserModal.classList.add('hidden');
      clearModalMessage();
    }, 1500);
  } catch (error) {
    showModalMessage(`Error: ${error.message}`, 'error');
  }
});

function renderData(docs) {
  dataContainer.innerHTML = '';
  if (docs.length === 0) {
    dataContainer.innerHTML = '<p>No data available.</p>';
    return;
  }

  docs.forEach(doc => {
    const data = doc.data();
    const div = document.createElement('div');
    div.className = 'bg-white p-4 rounded-md shadow mb-4';
    div.innerHTML = `
      <h3 class="font-semibold text-lg">${data.title || 'Untitled'}</h3>
      <p>${data.description || ''}</p>
    `;
    dataContainer.appendChild(div);
  });
}

// Listen for data updates and auth state
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Show admin toggle only for authorized users (you can implement better checks here)
  adminToggle.parentElement.style.display = 'flex';

  // Example: listen to Firestore collection 'notices'
  db.collection('notices').onSnapshot(snapshot => {
    renderData(snapshot.docs);
  });
});

export { };
