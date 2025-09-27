// --- Firebase: imports (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
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
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

console.log("Firebase connected:", firebaseConfig.projectId);

async function getStudentsByClass(className) {
  try {
    const qRef = query(
      collection(db, "students"),
      where("class", "==", className)
    );
    const snap = await getDocs(qRef);

    const students = [];
    snap.forEach(doc => students.push(doc.data()));
    return students;
  } catch (err) {
    console.error("Error fetching students:", err);
    return [];
  }
}
 const students = await getStudentsByClass("First Year Secondary");
console.log(students);

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
function populateClassSelects() {
  const build = () =>
    CLASS_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
  const reg = document.getElementById("reg-class");
  const edit = document.getElementById("edit-class");
  if (reg) reg.innerHTML = build();
  if (edit) edit.innerHTML = build();
}
function isValidClass(value) {
  return CLASS_OPTIONS.some(o => o.value === value);
}
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
// Boot
// -------------------------------
document.addEventListener('DOMContentLoaded', () => {
  populateClassSelects();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (adminDoc.exists() && adminDoc.data().active === true) {
          currentAdmin = { uid: user.uid, ...adminDoc.data() };
          isAdminLoggedIn = true;
          showAdminDashboard();
          await updateStudentsTable();
          await updateStudentsAutocomplete();
          const ustazEl = document.getElementById('ustaz-name');
          if (ustazEl) ustazEl.textContent = currentAdmin.name || "Ustaz";
          return;
        } else {
          await signOut(auth);
        }
      } catch (err) {
        console.error("Admin doc read error:", err);
        await signOut(auth);
      }
    }
    isAdminLoggedIn = false;
    currentAdmin = null;
    showAdminLogin();
  });
});

// -------------------------------
// Notices
// -------------------------------
function setResultsNotice(show, text) {
  const el = document.getElementById('results-notice');
  if (!el) return;
  if (text) el.textContent = text;
  el.style.display = show ? 'block' : 'none';
}

// -------------------------------
// Global/class results toggle
// -------------------------------
const SETTINGS_GLOBAL_REF = doc(db, "settings", "global");

async function ensureGlobalSettingsDoc() {
  const s = await getDoc(SETTINGS_GLOBAL_REF);
  if (!s.exists()) {
    await setDoc(SETTINGS_GLOBAL_REF, {
      resultsPublished: false,
      updatedAt: serverTimestamp()
    });
  }
}
async function readGlobalResultsPublished() {
  const s = await getDoc(SETTINGS_GLOBAL_REF);
  return s.exists() && !!s.data().resultsPublished;
}
async function writeGlobalResultsPublished(v) {
  await setDoc(SETTINGS_GLOBAL_REF, {
    resultsPublished: !!v,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
async function initAdminResultsToggle() {
  try {
    await ensureGlobalSettingsDoc();
    const toggle = document.getElementById('toggle-global-results');
    const status = document.getElementById('toggle-global-results-status');
    if (!toggle) {
      return;
    }
    const current = await readGlobalResultsPublished();
    toggle.checked = current;
    if (status) status.textContent = current
      ? "Published — students can see results."
      : "Hidden — students CANNOT see results yet.";
    toggle.onchange = async () => {
      const val = !!toggle.checked;
      await writeGlobalResultsPublished(val);
      if (status) status.textContent = val
        ? "Published — students can see results."
        : "Hidden — students CANNOT see results yet.";
      alert(val ? "Results are now visible globally." : "Results are now hidden globally.");
    };
  } catch (e) {
    console.error("Toggle init failed:", e);
  }
}

// Per-class toggle
async function initClassResultsToggle() {
  const table = document.getElementById('class-publish-table');
  if (!table) return;
  table.innerHTML = '';
  for (const c of CLASS_OPTIONS) {
    const ref = doc(db, "classes", c.value);
    const snap = await getDoc(ref);
    let published = snap.exists() ? !!snap.data().resultsPublished : false;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.label}</td>
      <td><input type="checkbox" id="class-toggle-${c.value}" ${published ? 'checked' : ''}></td>
    `;
    table.appendChild(tr);
    const checkbox = tr.querySelector('input');
    checkbox.onchange = async () => {
      await setDoc(ref, {
        resultsPublished: checkbox.checked,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert(`${c.label} results are now ${checkbox.checked ? 'VISIBLE' : 'HIDDEN'}`);
    };
  }
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
  showTab('register');
  updateStudentsTable();
  updateStudentsAutocomplete();
  initAdminResultsToggle();
  initClassResultsToggle(); // 👈 per-class toggle
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
// Tabs
// -------------------------------
function showTab(tabName, btnEl = null) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const panel = document.getElementById(tabName + '-tab');
  if (panel) panel.classList.add('active');
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}
document.addEventListener('click', (event) => {
  if (event.target.classList.contains('tab-btn')) {
    const key = event.target.textContent.toLowerCase().replace(' ', '');
    const map = { registerstudent: 'register', recordresults: 'results', studentslist: 'students', receipt: 'receipt' };
    showTab(map[key] || 'register', event.target);
  }
});

// -------------------------------
// Student lookup
// -------------------------------
async function lookupStudent(event) {
  event.preventDefault();

  const studentId = document.getElementById('student-id')?.value.trim();
  const inputPass = document.getElementById('student-pass')?.value.trim();

  if (!studentId || !inputPass) {
    showError('student-error', '⚠️ Please enter both Student ID and Password.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  let docSnap;
  try {
    docSnap = await getDoc(doc(db, "students", studentId));
  } catch (e) {
    console.error(e);
    showError('student-error', '⚠️ Could not read student record (permissions).');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  if (!docSnap.exists()) {
    showError('student-error', '❌ Student ID not found.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  const student = docSnap.data();
  const stored  = (student.password || '').toLowerCase();
  const given   = (inputPass || '').toLowerCase();

  if (stored !== given) {
    showError('student-error', '❌ Invalid password. Please try again.');
    document.getElementById('student-profile').style.display = 'none';
    return;
  }

  // 🔒 Global + Class publish gates (also wrapped)
  let published = true, classPublished = true;
  try {
    published = await readGlobalResultsPublished();
    const classSnap = await getDoc(doc(db, "classes", student.class));
    classPublished = classSnap.exists() ? !!classSnap.data().resultsPublished : false;
  } catch (e) {
    console.warn('Publish checks failed (rules?):', e);
  }

  if (!published || !classPublished) {
    setResultsNotice(true, "Results are not yet released for your class.");
    showStudentProfile(student, []); // show profile with empty results
    hideError('student-error');
    return;
  }

  // Results allowed → load and show
  let results = [];
  try {
    results = await listResults(studentId);
  } catch (e) {
    console.warn('Reading results blocked (rules?):', e);
  }
  setResultsNotice(false);
  showStudentProfile(student, results);
  hideError('student-error');
}
// -------------------------------
// Helper for ordinal suffix
// -------------------------------
function getOrdinalSuffix(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "st";
  if (n % 10 === 2 && n % 100 !== 12) return "nd";
  if (n % 10 === 3 && n % 100 !== 13) return "rd";
  return "th";
}

// -------------------------------
// Generate Positions for a class
// -------------------------------
async function generatePositionsForClass(className) {
  try {
    // Get all students in the class
    const q = query(collection(db, "students"), where("class", "==", className));
    const snap = await getDocs(q);

    if (snap.empty) {
      alert(`No students found for ${className}`);
      return;
    }

    // Collect students with their totals
    const students = [];
    for (const docSnap of snap.docs) {
      const s = docSnap.data();

      // Sum up all subjects for this student
      const resultsSnap = await getDocs(collection(db, "students", s.id, "results"));
      let totalMarks = 0;
      resultsSnap.forEach(r => { totalMarks += (r.data().total || 0); });

      students.push({
        id: s.id,
        name: s.name,
        total: totalMarks
      });
    }

    // Sort by total descending
    students.sort((a, b) => b.total - a.total);

    // Assign positions
    let currentPos = 1;
    let lastScore = null;
    students.forEach((s, i) => {
      if (lastScore !== null && s.total < lastScore) {
        currentPos = i + 1;
      }
      s.position = `${currentPos}${getOrdinalSuffix(currentPos)}`;
      lastScore = s.total;
    });

    // Save back to Firestore
    for (const s of students) {
      await updateDoc(doc(db, "students", s.id), {
        position: s.position,
        totalMarks: s.total,
        updatedAt: serverTimestamp()
      });
    }

    alert(`✅ Positions generated for ${className}`);
    await updateStudentsTable(); // refresh table
  } catch (err) {
    console.error("Error generating positions:", err);
    alert("Error generating positions. Check console.");
  }
}

// -------------------------------
// Generate Positions for ALL classes
// -------------------------------
async function generatePositionsAllClasses() {
  for (const c of CLASS_OPTIONS) {
    await generatePositionsForClass(c.value);
  }
  alert("✅ Positions generated for all classes!");
}

// -------------------------------
// Expose functions globally
// -------------------------------
Object.assign(window, {
  generatePositionsForClass,
  generatePositionsAllClasses
});

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
  let   fee       = parseInt(document.getElementById('reg-fee').value, 10);

  // ensure password is stored LOWERCASE
  const rawPassEl = document.getElementById('reg-pass');
  const password  = ((rawPassEl?.value || randomPassword()).trim()).toLowerCase();

  if (!id || !name || !className || isNaN(fee)) { alert('Please fill all fields.'); return; }
  if (!isValidClass(className))                 { alert('Please select a valid class.'); return; }
  if (fee < 0) fee = 0;

  const ref = doc(db, "students", id);
  const snap = await getDoc(ref);
  if (snap.exists()) { alert('Student ID already exists!'); return; }

  await setDoc(ref, {
    id, name, class: className, fee, paid: 0,
    password,                    // ← stored normalized
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });

  document.getElementById('register-form').reset();
  populateClassSelects();
  await updateStudentsAutocomplete();
  await updateStudentsTable();
  alert(`✅ Student registered successfully! Password: ${password}`);
}

// -------------------------------
// Record Results
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
  alert('Results recorded successfully!');
}

// -------------------------------
// Helpers for results
// -------------------------------
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
// Students table
// -------------------------------
async function updateStudentsTable() {
  const tbody = document.getElementById('students-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const snap = await getDocs(collection(db, "students"));
  snap.forEach(d => {
    const s = d.data();
        const fee  = Number(s.fee)  || 0;
    const paid = Number(s.paid) || 0;
    const outstanding = Math.max(fee - paid, 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.id}</td>
      <td>${s.name}</td>
      <td>${displayClass(s.class)}</td>
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
  let options = '';
  snap.forEach(d => { const s = d.data(); options += `<option value="${s.id}"></option>`; });
  list1.innerHTML = options;
  list2.innerHTML = options;
}

// -------------------------------
// Edit / Save / Delete
// -------------------------------
async function editStudent(studentId) {
  const ref = doc(db, "students", studentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("Student not found");

  const s = snap.data();
  currentEditingStudentId = studentId;

  document.getElementById('edit-name').value  = s.name || '';
  document.getElementById('edit-class').value = isValidClass(s.class) ? s.class : CLASS_OPTIONS[0].value;
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

  if (!isValidClass(cls)) {
    alert('Please select a valid class.');
    return;
  }
  fee  = isNaN(fee)  ? 0 : fee;
  paid = isNaN(paid) ? 0 : paid;
  if (paid > fee) paid = fee;

  await updateDoc(doc(db, "students", currentEditingStudentId), {
    name, class: cls, fee, paid, updatedAt: serverTimestamp()
  });

  await updateStudentsTable();
  await updateStudentsAutocomplete();
  closeEditModal();
  alert('Student updated successfully!');
}
async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to delete this student?')) return;
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
  document.getElementById('receipt-class').textContent= displayClass(student.class);
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
  // ✅ Password included in receipt
  document.getElementById('receipt-password').textContent = `Student Password: ${student.password || '(not set)'}`;
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
// Expose functions globally
// -------------------------------
// --- Expose functions globally for HTML buttons ---
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
  deleteStudent,
  generatePositionsAllClasses,  // 👈 include your new function here
});





