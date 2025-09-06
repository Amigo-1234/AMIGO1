// --- Firebase: imports (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- Your Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyAFdfON4KABa8pT60ACBdwAIO6EgarO5zs",
  authDomain: "ginna-b79aa.firebaseapp.com",
  projectId: "ginna-b79aa",
  storageBucket: "ginna-b79aa.firebasestorage.app",
  messagingSenderId: "240601294134",
  appId: "1:240601294134:web:507ffc996d941ef1583f97"
};

// --- Init Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

console.log("Firebase connected:", firebaseConfig.projectId);

// -------------------------------
// Session state
// -------------------------------
let isAdminLoggedIn = false;
let currentAdmin = null;           // { uid, name, role, allowedClasses: [], active: true }
let currentEditingStudentId = null;

// -------------------------------
// Boot (Auth-aware)
// -------------------------------
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const adminDoc = await getDoc(doc(db, "admins", user.uid));
      if (adminDoc.exists() && adminDoc.data().active === true) {
        currentAdmin = { uid: user.uid, ...adminDoc.data() };
        isAdminLoggedIn = true;
        showAdminDashboard();
        await updateStudentsTable();
        await updateStudentsAutocomplete();
        // Optional: show ustaz name somewhere if you have an element
        const ustazEl = document.getElementById('ustaz-name');
        if (ustazEl) ustazEl.textContent = currentAdmin.name || "Ustaz";
        return;
      } else {
        await signOut(auth);
      }
    }
    // Not signed-in OR not active admin
    isAdminLoggedIn = false;
    currentAdmin = null;
    showAdminLogin();
  });
});

// -------------------------------
// Helper: local role gate
// -------------------------------
function canWriteClassLocally(className) {
  if (!currentAdmin || !Array.isArray(currentAdmin.allowedClasses)) return false;
  return currentAdmin.allowedClasses.includes(className);
}

// -------------------------------
// Navigation
// -------------------------------
function hideAllPages() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
}
function showLanding() {
  hideAllPages();
  document.getElementById('landing-page').classList.add('active');
}
function showStudentLogin() {
  hideAllPages();
  document.getElementById('student-page').classList.add('active');
  document.getElementById('student-form')?.reset();
  document.getElementById('student-profile').style.display = 'none';
  hideError('student-error');
}
function showAdminLogin() {
  hideAllPages();
  document.getElementById('admin-login-page').classList.add('active');
  document.getElementById('admin-form')?.reset();
  hideError('admin-error');
}
function showAdminDashboard() {
  hideAllPages();
  document.getElementById('admin-dashboard').classList.add('active');
  showTab('register'); // default tab
  updateStudentsTable();
  updateStudentsAutocomplete();

  // If you have a "classes this ustaz can manage" hint area:
  const classesEl = document.getElementById('ustaz-classes');
  if (classesEl && currentAdmin?.allowedClasses?.length) {
    classesEl.textContent = currentAdmin.allowedClasses.join(", ");
  }
}

// -------------------------------
// Auth: Login / Logout
// -------------------------------
async function adminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const adminDoc = await getDoc(doc(db, "admins", cred.user.uid));
    if (!adminDoc.exists() || adminDoc.data().active !== true) {
      await signOut(auth);
      throw new Error("Your admin access is not active. Contact the owner.");
    }
    currentAdmin = { uid: cred.user.uid, ...adminDoc.data() };
    isAdminLoggedIn = true;
    localStorage.setItem('markazAdminSession', 'true'); // optional UI flag
    showAdminDashboard();
    hideError('admin-error');
  } catch (e) {
    showError('admin-error', e.message || 'Login failed.');
  }
}
async function adminLogout() {
  await signOut(auth);
  isAdminLoggedIn = false;
  currentAdmin = null;
  localStorage.removeItem('markazAdminSession');
  showLanding();
}

// -------------------------------
// Tabs (robust)
// -------------------------------
function showTab(tabName, btnEl = null) {
  // panels
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const panel = document.getElementById(tabName + '-tab');
  if (panel) panel.classList.add('active');

  // buttons
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => b.classList.remove('active'));
  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    const map = { register: 'Register Student', results: 'Record Results', students: 'Students List', receipt: 'Receipt' };
    const target = Array.from(tabBtns).find(b => b.textContent.trim() === map[tabName]);
    if (target) target.classList.add('active');
  }

  if (tabName === 'students') updateStudentsTable();
}
// Delegate clicks
document.addEventListener('click', (event) => {
  if (event.target.classList.contains('tab-btn')) {
    const key = event.target.textContent.toLowerCase().replace(' ', '');
    const map = { registerstudent: 'register', recordresults: 'results', studentslist: 'students', receipt: 'receipt' };
    showTab(map[key] || 'register', event.target);
  }
});

// -------------------------------
/* Student lookup (public read by default; change rules if needed) */
// -------------------------------
async function lookupStudent(event) {
  event.preventDefault();
  const studentId = document.getElementById('student-id').value.trim();
  if (!studentId) return;

  const ref = doc(db, "students", studentId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    showError('student-error', 'Student ID not found.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  const student = snap.data();
  const results = await listResults(studentId);
  showStudentProfile(student, results);
  hideError('student-error');
}
function showStudentProfile(student, results = []) {
  // info
  document.getElementById('student-name').textContent  = student.name ?? '';
  document.getElementById('student-class').textContent = student.class ?? '';

  // fees
  const fee  = Number(student.fee)  || 0;
  const paid = Number(student.paid) || 0;
  const outstanding = Math.max(fee - paid, 0);
  document.getElementById('fee-amount').textContent      = `₦${fee.toLocaleString()}`;
  document.getElementById('fee-paid').textContent        = `₦${paid.toLocaleString()}`;
  document.getElementById('fee-outstanding').textContent = `₦${outstanding.toLocaleString()}`;

  const pill = document.getElementById('fee-status');
  pill.className = 'status-pill';
  if (outstanding === 0) { pill.classList.add('paid'); pill.textContent = 'PAID'; }
  else if (paid > 0)     { pill.classList.add('partial'); pill.textContent = 'PARTIAL'; }
  else                   { pill.classList.add('unpaid'); pill.textContent = 'UNPAID'; }

  // results table
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  if (results.length) {
    results.forEach(r => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${r.subject}</td>
        <td>${r.ca}</td>
        <td>${r.exam}</td>
        <td>${r.total}</td>
        <td class="grade-${(r.grade||'').toLowerCase()}">${r.grade}</td>
        <td>${r.date || ''}</td>
      `;
    });
  } else {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666;">No results available</td></tr>';
  }
  document.getElementById('student-profile').style.display = 'block';
}

// -------------------------------
// Register student (admins; role-limited by class)
// -------------------------------
async function registerStudent(event) {
  event.preventDefault();

  const id        = document.getElementById('reg-id').value.trim();
  const name      = document.getElementById('reg-name').value.trim();
  const className = document.getElementById('reg-class').value;
  let fee         = parseInt(document.getElementById('reg-fee').value);

  if (!id || !name || !className || isNaN(fee)) {
    alert('Please fill all fields.');
    return;
  }
  if (!canWriteClassLocally(className)) {
    alert(`You are not allowed to register students for "${className}".`);
    return;
  }
  if (fee < 0) fee = 0;

  const ref  = doc(db, "students", id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    alert('Student ID already exists!');
    return;
  }

  await setDoc(ref, {
    id, name, class: className, fee, paid: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  document.getElementById('register-form').reset();
  await updateStudentsAutocomplete();
  await updateStudentsTable();
  alert('Student registered successfully!');
}

// -------------------------------
// Record Results (admins; subcollection)
// -------------------------------
function calculateGrade(total) {
  if (total >= 70) return 'A';
  if (total >= 60) return 'B';
  if (total >= 50) return 'C';
  if (total >= 45) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}
async function recordResults(event) {
  event.preventDefault();
  const studentId = document.getElementById('result-student-id').value.trim();
  const subject   = document.getElementById('result-subject').value.trim();
  const ca        = parseInt(document.getElementById('result-ca').value);
  const exam      = parseInt(document.getElementById('result-exam').value);

  if (!studentId || !subject || isNaN(ca) || isNaN(exam)) {
    alert('Please complete all fields.');
    return;
  }
  if (ca < 0 || ca > 40 || exam < 0 || exam > 60) {
    alert('Please keep CA within 0–40 and Exam within 0–60.');
    return;
  }

  // Optional local check (rules still enforce):
  const sSnap = await getDoc(doc(db, "students", studentId));
  if (!sSnap.exists()) return alert('Student not found!');
  const s = sSnap.data();
  if (!canWriteClassLocally(s.class)) {
    return alert(`You are not allowed to record results for "${s.class}".`);
    // The Firestore security rules will also block the write if attempted.
  }

  const total = ca + exam;
  const grade = calculateGrade(total);

  const rRef = doc(db, "students", studentId, "results", subject);
  await setDoc(rRef, {
    subject, ca, exam, total, grade,
    date: new Date().toLocaleDateString('en-NG'),
    recordedAt: serverTimestamp()
  }, { merge: true });

  document.getElementById('results-form').reset();
  alert('Results recorded successfully!');
}

// read helpers
async function listResults(studentId) {
  const qRef = query(collection(db, "students", studentId, "results"), orderBy("subject"));
  const snap = await getDocs(qRef);
  const arr = [];
  snap.forEach(d => arr.push(d.data()));
  return arr;
}
async function getLatestResult(studentId) {
  try {
    const qRef = query(collection(db, "students", studentId, "results"), orderBy("recordedAt", "desc"), limit(1));
    const snap = await getDocs(qRef);
    const docs = [];
    snap.forEach(d => docs.push(d.data()));
    if (docs.length) return docs[0];
  } catch (_) {}
  const all = await listResults(studentId);
  return all[all.length - 1] || null;
}

// -------------------------------
// Students table & datalists (UI filtered to allowed classes)
// -------------------------------
async function updateStudentsTable() {
  const tbody = document.getElementById('students-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const snap = await getDocs(collection(db, "students"));
  let rows = [];
  snap.forEach(d => rows.push(d.data()));

  if (currentAdmin?.allowedClasses?.length) {
    rows = rows.filter(s => currentAdmin.allowedClasses.includes(s.class));
  }

  rows.forEach(s => {
    const fee  = Number(s.fee)  || 0;
    const paid = Number(s.paid) || 0;
    const outstanding = Math.max(fee - paid, 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.id}</td>
      <td>${s.name}</td>
      <td>${s.class}</td>
      <td>₦${fee.toLocaleString()}</td>
      <td>₦${paid.toLocaleString()}</td>
      <td>₦${outstanding.toLocaleString()}</td>
      <td>
        <button onclick="generateReceiptForStudent('${s.id}')" class="btn btn-primary btn-sm">Receipt</button>
        <button onclick="editStudent('${s.id}')" class="btn btn-outline btn-sm">Edit</button>
        <button onclick="deleteStudent('${s.id}')" class="btn btn-danger btn-sm">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
async function updateStudentsAutocomplete() {
  const list1 = document.getElementById('students-list');
  const list2 = document.getElementById('students-list-receipt');
  if (!list1 || !list2) return;

  const snap = await getDocs(collection(db, "students"));
  let ids = [];
  snap.forEach(d => ids.push(d.data().id));

  // Optional: filter options to ustaz’s classes (requires reading each doc’s class; we already did above)
  let options = '';
  for (const id of ids) {
    options += `<option value="${id}"></option>`;
  }
  list1.innerHTML = options;
  list2.innerHTML = options;
}

// -------------------------------
// Edit / Save / Delete (admins; class-limited)
// -------------------------------
async function editStudent(studentId) {
  const ref = doc(db, "students", studentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("Student not found");

  const s = snap.data();
  if (!canWriteClassLocally(s.class)) {
    return alert(`You are not allowed to edit students in "${s.class}".`);
  }

  currentEditingStudentId = studentId;
  document.getElementById('edit-name').value  = s.name || '';
  document.getElementById('edit-class').value = s.class || '';
  document.getElementById('edit-fee').value   = Number(s.fee) || 0;
  document.getElementById('edit-paid').value  = Number(s.paid) || 0;

  document.getElementById('edit-modal').classList.add('show');
}
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('show');
  currentEditingStudentId = null;
}
async function saveStudentEdit(event) {
  event.preventDefault();
  if (!currentEditingStudentId) return;

  const name = document.getElementById('edit-name').value.trim();
  const cls  = document.getElementById('edit-class').value;
  let fee  = parseInt(document.getElementById('edit-fee').value);
  let paid = parseInt(document.getElementById('edit-paid').value);

  fee  = isNaN(fee)  ? 0 : fee;
  paid = isNaN(paid) ? 0 : paid;
  if (fee < 0) fee = 0;
  if (paid < 0) paid = 0;
  if (paid > fee) paid = fee;

  // Make sure the admin can write both old and new class (rules also enforce)
  const oldSnap = await getDoc(doc(db, "students", currentEditingStudentId));
  if (!oldSnap.exists()) return alert('Student not found!');
  const oldClass = oldSnap.data().class;
  if (!canWriteClassLocally(oldClass) || !canWriteClassLocally(cls)) {
    return alert(`You are not allowed to change this student to class "${cls}".`);
  }

  await updateDoc(doc(db, "students", currentEditingStudentId), {
    name, class: cls, fee, paid, updatedAt: serverTimestamp()
  });

  await updateStudentsTable();
  await updateStudentsAutocomplete();
  closeEditModal();
  alert('Student updated successfully!');
}
async function deleteStudent(studentId) {
  const sSnap = await getDoc(doc(db, "students", studentId));
  if (!sSnap.exists()) return alert('Student not found!');
  const s = sSnap.data();
  if (!canWriteClassLocally(s.class)) {
    return alert(`You are not allowed to delete students in "${s.class}".`);
  }

  if (!confirm('Are you sure you want to delete this student? This action cannot be undone.')) return;

  // Optional: delete subcollection results
  try {
    const rSnap = await getDocs(collection(db, "students", studentId, "results"));
    const deletions = [];
    rSnap.forEach(d => deletions.push(deleteDoc(doc(db, "students", studentId, "results", d.id))));
    await Promise.all(deletions);
  } catch (_) {}

  await deleteDoc(doc(db, "students", studentId));
  await updateStudentsTable();
  await updateStudentsAutocomplete();
}

// -------------------------------
// Receipt
// -------------------------------
async function generateReceipt(event) {
  event.preventDefault();
  const studentId = document.getElementById('receipt-student-id').value.trim();
  await buildAndShowReceipt(studentId);
}
async function generateReceiptForStudent(studentId) {
  showTab('receipt');
  document.getElementById('receipt-student-id').value = studentId;
  await buildAndShowReceipt(studentId);
}
async function buildAndShowReceipt(studentId) {
  if (!studentId) return alert('Please enter a Student ID.');
  const sSnap = await getDoc(doc(db, "students", studentId));
  if (!sSnap.exists()) return alert('Student not found!');
  const s = sSnap.data();

  const latest = await getLatestResult(studentId);
  showReceiptView(s, latest);
}
function showReceiptView(student, latestResult = null) {
  const fee  = Number(student.fee)  || 0;
  const paid = Number(student.paid) || 0;
  const outstanding = Math.max(fee - paid, 0);

  document.getElementById('receipt-date').textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  document.getElementById('receipt-id').textContent   = student.id;
  document.getElementById('receipt-name').textContent = student.name;
  document.getElementById('receipt-class').textContent= student.class;
  document.getElementById('receipt-fee').textContent  = `₦${fee.toLocaleString()}`;
  document.getElementById('receipt-paid').textContent = `₦${paid.toLocaleString()}`;
  document.getElementById('receipt-outstanding').textContent = `₦${outstanding.toLocaleString()}`;

  const resultDiv = document.getElementById('receipt-result');
  if (latestResult) {
    resultDiv.innerHTML = `
      <p><strong>Subject:</strong> ${latestResult.subject}</p>
      <p><strong>Total Score:</strong> ${latestResult.total} (Grade: ${latestResult.grade})</p>
      <p><strong>Date:</strong> ${latestResult.date || ''}</p>
    `;
  } else {
    resultDiv.innerHTML = '<p style="color:#666;">No results available</p>';
  }
  document.getElementById('receipt-view').style.display = 'block';
}
function printReceipt() { window.print(); }

// -------------------------------
// Errors
// -------------------------------
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
}
function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('show');
}

// -------------------------------
// Modal close on outside click
// -------------------------------
const editModal = document.getElementById('edit-modal');
if (editModal) {
  editModal.addEventListener('click', (ev) => {
    if (ev.target === editModal) closeEditModal();
  });
}

// -------------------------------
// Expose functions for inline HTML
// -------------------------------
Object.assign(window, {
  showStudentLogin,
  showAdminLogin,
  showLanding,
  lookupStudent,
  adminLogin,
  adminLogout,
  showTab,
  registerStudent,
  recordResults,
  generateReceipt,
  generateReceiptForStudent,
  printReceipt,
  closeEditModal,
  saveStudentEdit,
  editStudent,
  deleteStudent
});
