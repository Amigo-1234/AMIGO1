// --- Firebase: imports (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, orderBy, serverTimestamp, limit, where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- Firebase config ---
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
// Class system
// -------------------------------
const CLASS_OPTIONS = [
  { value: "First Year Preparatory",  label: "Al-Awwal Al-I‘dādī – First Year Preparatory" },
  { value: "Second Year Preparatory", label: "Ath-Thānī Al-I‘dādī – Second Year Preparatory" },
  { value: "Third Year Preparatory",  label: "Ath-Thālith Al-I‘dādī – Third Year Preparatory" },
  { value: "First Year Secondary",    label: "Al-Awwal Ath-Thanawī – First Year Secondary" },
  { value: "Second Year Secondary",   label: "Ath-Thānī Ath-Thanawī – Second Year Secondary" },
  { value: "Third Year Secondary",    label: "Ath-Thālith Ath-Thanawī – Third Year Secondary" }
];
const CLASS_MAP = Object.fromEntries(CLASS_OPTIONS.map(o => [o.value, o.label]));
function displayClass(value) {
  return CLASS_MAP[value] || value || "";
}

// -------------------------------
// Helpers
// -------------------------------
function randomPassword() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 3; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

// -------------------------------
// Session state
// -------------------------------
let isAdminLoggedIn = false;
let currentAdmin = null;
let currentEditingStudentId = null;

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
  showTab('register');
  updateStudentsTable();
  updateStudentsAutocomplete();
}

// -------------------------------
// Auth
// -------------------------------
async function adminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const adminRef = doc(db, "admins", cred.user.uid);
    const adminDoc = await getDoc(adminRef);
    if (!adminDoc.exists() || adminDoc.data().active !== true) {
      await signOut(auth);
      throw new Error("No active admin profile.");
    }
    currentAdmin = { uid: cred.user.uid, ...adminDoc.data() };
    isAdminLoggedIn = true;
    showAdminDashboard();
    hideError('admin-error');
  } catch (e) {
    console.error("Login error:", e);
    showError('admin-error', 'Login failed.');
  }
}
async function adminLogout() {
  await signOut(auth);
  isAdminLoggedIn = false;
  currentAdmin = null;
  showLanding();
}

// -------------------------------
// Student lookup
// -------------------------------
async function lookupStudent(event) {
  event.preventDefault();
  const studentId = document.getElementById('student-id')?.value.trim();
  const password  = document.getElementById('student-pass')?.value.trim();
  if (!studentId || !password) {
    showError('student-error', '⚠️ Please enter both Student ID and Password.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }
  const docRef = doc(db, "students", studentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    showError('student-error', '❌ Student ID not found.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }
  const student = docSnap.data();
  if (!student.password || student.password !== password.toLowerCase()) {
    showError('student-error', '❌ Invalid password. Please try again.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  const results = await listResults(studentId);
  showStudentProfile(student, results);
  hideError('student-error');
}

// -------------------------------
// Student profile display
// -------------------------------
function showStudentProfile(student, results = []) {
  document.getElementById('student-name').textContent  = student.name ?? '';
  document.getElementById('student-class').textContent = displayClass(student.class);

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
// Register student
// -------------------------------
async function registerStudent(event) {
  event.preventDefault();
  const id        = document.getElementById('reg-id').value.trim();
  const name      = document.getElementById('reg-name').value.trim();
  const className = document.getElementById('reg-class').value;
  let fee         = parseInt(document.getElementById('reg-fee').value);
  const password  = (document.getElementById('reg-pass')?.value.trim() || randomPassword());

  if (!id || !name || !className || isNaN(fee)) {
    alert('Please fill all fields.'); return;
  }
  if (fee < 0) fee = 0;

  const ref  = doc(db, "students", id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    alert('Student ID already exists!'); return;
  }

  await setDoc(ref, {
    id, name, class: className, fee, paid: 0, password,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });

  document.getElementById('register-form').reset();
  await updateStudentsAutocomplete();
  await updateStudentsTable();
  alert(`✅ Student registered! Password: ${password}`);
}

// -------------------------------
// Record Results (Uztaz only)
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
  if (!isAdminLoggedIn) {
    alert("Only the Uztaz can record results."); return;
  }

  const studentId = document.getElementById('result-student-id').value.trim();
  const subject   = document.getElementById('result-subject').value.trim();
  const ca        = parseInt(document.getElementById('result-ca').value);
  const exam      = parseInt(document.getElementById('result-exam').value);

  if (!studentId || !subject || isNaN(ca) || isNaN(exam)) {
    alert('Please complete all fields.'); return;
  }

  const sRef = doc(db, "students", studentId);
  const sSnap = await getDoc(sRef);
  if (!sSnap.exists()) { alert('Student not found!'); return; }

  const total = ca + exam;
  const grade = calculateGrade(total);
  const rRef = doc(db, "students", studentId, "results", subject);

  await setDoc(rRef, {
    subject, ca, exam, total, grade,
    date: new Date().toLocaleDateString('en-NG'),
    recordedAt: serverTimestamp()
  }, { merge: true });

  document.getElementById('results-form').reset();
  alert('✅ Result recorded!');
}

// -------------------------------
// Position Generator
// -------------------------------
async function generatePositionsForClass(className) {
  const qRef = query(collection(db, "students"), where("class", "==", className));
  const snap = await getDocs(qRef);
  const students = [];

  for (const docu of snap.docs) {
    const student = docu.data();
    const results = await listResults(student.id);
    const totalMarks = results.reduce((sum, r) => sum + (r.total || 0), 0);
    students.push({ id: student.id, totalMarks });
  }

  students.sort((a, b) => b.totalMarks - a.totalMarks);
  for (let i = 0; i < students.length; i++) {
    const position = i + 1;
    await updateDoc(doc(db, "students", students[i].id), { position });
  }
}
async function generatePositionsAllClasses() {
  try {
    for (const c of CLASS_OPTIONS) {
      await generatePositionsForClass(c.value);
    }
    alert("✅ Positions generated for all classes!");
  } catch (err) {
    console.error("Error generating positions:", err);
    alert("Error generating positions. Check console.");
  }
}

// -------------------------------
// Results helpers
// -------------------------------
async function listResults(studentId) {
  const qRef = query(collection(db, "students", studentId, "results"), orderBy("subject"));
  const snap = await getDocs(qRef);
  const arr = [];
  snap.forEach(d => arr.push(d.data()));
  return arr;
}

// -------------------------------
// Receipt
// -------------------------------
async function generateReceipt(event) {
  event.preventDefault();
  const studentId = document.getElementById('receipt-student-id').value.trim();
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
async function getLatestResult(studentId) {
  const qRef = query(
    collection(db, "students", studentId, "results"),
    orderBy("recordedAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(qRef);
  const docs = [];
  snap.forEach(d => docs.push(d.data()));
  return docs.length ? docs[0] : null;
}
function showReceiptView(student, latestResult = null) {
  document.getElementById('receipt-id').textContent   = student.id;
  document.getElementById('receipt-name').textContent = student.name;
  document.getElementById('receipt-class').textContent= displayClass(student.class);
  document.getElementById('receipt-fee').textContent  = `₦${student.fee}`;
  document.getElementById('receipt-paid').textContent = `₦${student.paid}`;
  document.getElementById('receipt-outstanding').textContent = `₦${Math.max(student.fee-student.paid,0)}`;
  document.getElementById('receipt-password').textContent = `Password: ${student.password}`;

  const resultDiv = document.getElementById('receipt-result');
  if (latestResult) {
    resultDiv.innerHTML = `
      <p><strong>Subject:</strong> ${latestResult.subject}</p>
      <p><strong>Total Score:</strong> ${latestResult.total} (Grade: ${latestResult.grade})</p>
    `;
  } else {
    resultDiv.innerHTML = '<p>No results yet.</p>';
  }
  document.getElementById('receipt-view').style.display = 'block';
}
function printReceipt() { window.print(); }

// -------------------------------
// Admin student edit/delete
// -------------------------------
function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}
async function saveStudentEdit(event) {
  event.preventDefault();
  if (!currentEditingStudentId) return;
  const name = document.getElementById('edit-name').value.trim();
  const className = document.getElementById('edit-class').value;
  const fee = parseInt(document.getElementById('edit-fee').value);
  const paid = parseInt(document.getElementById('edit-paid').value);

  await updateDoc(doc(db, "students", currentEditingStudentId), {
    name, class: className, fee, paid,
    updatedAt: serverTimestamp()
  });
  closeEditModal();
  updateStudentsTable();
}
function editStudent(id, data) {
  currentEditingStudentId = id;
  document.getElementById('edit-name').value = data.name;
  document.getElementById('edit-class').value = data.class;
  document.getElementById('edit-fee').value = data.fee;
  document.getElementById('edit-paid').value = data.paid;
  document.getElementById('edit-modal').style.display = 'block';
}
async function deleteStudent(id) {
  if (!confirm("Are you sure you want to delete this student?")) return;
  await deleteDoc(doc(db, "students", id));
  updateStudentsTable();
}

// -------------------------------
// Tabs
// -------------------------------
function showTab(tabName, btnEl = null) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const panel = document.getElementById(tabName + '-tab');
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}

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
// Expose globally
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
  buildAndShowReceipt,
  printReceipt,
  closeEditModal,
  saveStudentEdit,
  editStudent,
  deleteStudent,
  generatePositionsAllClasses
});






