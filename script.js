// --- Firebase (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, orderBy, serverTimestamp, limit, where, runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* =========================
   🔥 Firebase init
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyAFdfON4KABa8pT60ACBdwAIO6EgarO5zs",
  authDomain: "ginna-b79aa.firebaseapp.com",
  projectId: "ginna-b79aa",
  storageBucket: "ginna-b79aa.firebasestorage.app",
  messagingSenderId: "240601294134",
  appId: "1:240601294134:web:507ffc996d941ef1583f97"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
console.log("✅ Firebase connected:", firebaseConfig.projectId);

/* =========================
   📅 Year & classes
========================= */
const CURRENT_YEAR = new Date().getFullYear();

const CLASS_OPTIONS = [
  { value: "Ibtidaiyah", label: "Ibtidā’iyah (Beginner)", code: "IBT" },
  { value: "Idadiyah",   label: "Idādiyah (Middle)",      code: "IDA" },
  { value: "Thanawiyah", label: "Thanāwiyah (Senior)",    code: "THA" }
];
const CLASS_LABELS = Object.fromEntries(CLASS_OPTIONS.map(c => [c.value, c.label]));
const CLASS_CODES  = Object.fromEntries(CLASS_OPTIONS.map(c => [c.value, c.code]));

const SUBJECTS_BY_CLASS = {
  Ibtidaiyah: ["Tajweed","Arabic","Qur'an","Hadith","Fiqh","Akhlaq","Nahwu","Sarf","Dictation","Reading"],
  Idadiyah:   ["Tajweed II","Arabic II","Qur'an II","Hadith II","Fiqh II","Akhlaq II","Nahwu II","Sarf II","Dictation II","Reading II"],
  Thanawiyah: ["Tafsir III","Balagha III","Qur'an III","Hadith III","Fiqh III","Seerah III","Nahwu III","Sarf III","Dictation III","Reading III"]
};

function populateClassSelects() {
  const html = CLASS_OPTIONS.map(c => `<option value="${c.value}">${c.label}</option>`).join("");
  ["reg-class","edit-class","promote-class-select"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}
function getClassCode(v){ return CLASS_CODES[v] || ""; }
function displayClass(v){ return CLASS_LABELS[v] || v || ""; }
function isValidClass(v){ return !!CLASS_CODES[v]; }

/* =========================
   ✨ Tiny UI helpers
========================= */
(function ensureToastHost(){
  if (document.getElementById('toast-host')) return;
  const host = document.createElement('div');
  host.id = 'toast-host';
  host.style.cssText = `position:fixed; right:14px; bottom:14px; z-index:9999; display:flex; flex-direction:column; gap:8px;`;
  document.body.appendChild(host);
})();
function toast(msg, type="info", ms=2300){
  const el = document.createElement('div');
  el.role = "status";
  el.style.cssText = `
    max-width:min(92vw,420px); background:${type==="error"?"#ffeded":type==="ok"?"#e9fff1":"#eef3ff"};
    color:${type==="error"?"#7a1a1a":type==="ok"?"#105c2f":"#243872"};
    border:1px solid ${type==="error"?"#ffbfbf":type==="ok"?"#b8f1cd":"#cfd9ff"};
    border-radius:10px; padding:12px 14px; box-shadow:0 6px 20px rgba(0,0,0,.13);
    font: 500 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial; transform:translateY(10px); opacity:0; transition:.18s ease;
  `;
  el.textContent = msg;
  document.getElementById('toast-host').appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity="1"; el.style.transform="translateY(0)"; });
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(10px)"; setTimeout(()=> el.remove(),180); }, ms);
}
function setLoading(el,isLoading,textWhenDone){
  if(!el) return;
  el.disabled = !!isLoading;
  if(isLoading){ el.dataset.oldText=el.textContent; el.textContent='Please wait…'; el.style.opacity="0.7";}
  else{ el.textContent=textWhenDone||el.dataset.oldText||el.textContent; el.style.opacity="1"; }
}
function setResultsNotice(show,text){
  const el=document.getElementById('results-notice'); if(!el) return;
  if(text) el.textContent = text;
  el.classList.toggle('hidden', !show);
}
function randomPassword(){
  const letters="abcdefghijklmnopqrstuvwxyz";
  return Array.from({length:3},()=>letters[Math.floor(Math.random()*letters.length)]).join("");
}
function ordinalSuffix(i){ const j=i%10,k=i%100; if(j===1&&k!==11)return i+"st"; if(j===2&&k!==12)return i+"nd"; if(j===3&&k!==13)return i+"rd"; return i+"th"; }
const busy = { register:false, recordSingle:false, lookupTable:false, saveAll:false };

/* =========================
   🧭 Navigation
========================= */
function hideAllPages(){ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); }
function showLanding(){ hideAllPages(); document.getElementById('landing-page')?.classList.add('active'); }
function showStudentLogin(){
  hideAllPages(); document.getElementById('student-page')?.classList.add('active');
  document.getElementById('student-form')?.reset();
  const prof = document.getElementById('student-profile'); if (prof) prof.style.display='none';
  hideError('student-error');
}
function showAdminLogin(){
  hideAllPages(); document.getElementById('admin-login-page')?.classList.add('active');
  document.getElementById('admin-form')?.reset();
  hideError('admin-error');
}
function showAdminDashboard(){
  hideAllPages(); document.getElementById('admin-dashboard')?.classList.add('active');
  showTab('register');
  populateClassSelects();
  updateStudentsTable();
  updateStudentsAutocomplete();
  initAdminResultsToggle();
  initClassResultsToggle();
}

/* =========================
   👤 Auth (admin)
========================= */
let isAdminLoggedIn=false; let currentAdmin=null;

async function adminLogin(e){
  e.preventDefault();
  const email=document.getElementById('admin-email').value.trim();
  const password=document.getElementById('admin-password').value;
  try{
    const cred=await signInWithEmailAndPassword(auth,email,password);
    const adminSnap=await getDoc(doc(db,"admins",cred.user.uid));
    if(!adminSnap.exists() || !adminSnap.data().active){ await signOut(auth); throw new Error("No active admin profile."); }
    currentAdmin={ uid:cred.user.uid, ...adminSnap.data() };
    isAdminLoggedIn=true;
    // IMPORTANT: do NOT call showAdminDashboard() here; let onAuthStateChanged handle it once.
    toast("Welcome back 👋", "ok", 1600);
  }catch(err){
    console.error(err);
    showError('admin-error',"Login failed.");
    toast("Admin login failed", "error");
  }
}
async function adminLogout(){ await signOut(auth); isAdminLoggedIn=false; currentAdmin=null; showLanding(); toast("Logged out", "info", 1200); }

onAuthStateChanged(auth, async (user)=>{
  if(user){
    try{
      const snap=await getDoc(doc(db,"admins",user.uid));
      if(snap.exists() && snap.data().active){ currentAdmin={ uid:user.uid, ...snap.data() }; isAdminLoggedIn=true; showAdminDashboard(); return; }
    }catch{}
    await signOut(auth); showAdminLogin();
  }else{ showAdminLogin(); }
});

/* =========================
   📑 Tabs
========================= */
function showTab(tabName, btnEl = null) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`${tabName}-tab`)?.classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (tabName === 'students') updateStudentsTable?.();
  if (tabName === 'results' || tabName === 'receipt') updateStudentsAutocomplete?.();
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab, btn));
});
document.addEventListener('DOMContentLoaded', () => {
  const activeBtn = document.querySelector('.tab-btn.active') || document.querySelector('.tab-btn');
  if (activeBtn) showTab(activeBtn.dataset.tab, activeBtn);
});

/* =========================
   🔒 Results visibility (with guards)
========================= */
const SETTINGS_GLOBAL_REF = doc(db,"settings","global");
async function ensureGlobalSettingsDoc(){
  const s=await getDoc(SETTINGS_GLOBAL_REF);
  if(!s.exists()) await setDoc(SETTINGS_GLOBAL_REF,{ resultsPublished:false, updatedAt:serverTimestamp() });
}
async function readGlobalResultsPublished(){
  const s=await getDoc(SETTINGS_GLOBAL_REF); return s.exists() && !!s.data().resultsPublished;
}
async function writeGlobalResultsPublished(v){
  await setDoc(SETTINGS_GLOBAL_REF,{ resultsPublished:!!v, updatedAt:serverTimestamp() },{ merge:true });
}

let globalToggleInitialized = false;
async function initAdminResultsToggle(){
  if (globalToggleInitialized) return;
  globalToggleInitialized = true;
  try{
    await ensureGlobalSettingsDoc();
    const toggle=document.getElementById('toggle-global-results');
    const status=document.getElementById('toggle-global-results-status');
    if(!toggle) return;
    const current=await readGlobalResultsPublished();
    toggle.checked=current;
    if(status) status.textContent = current ? "Published — students can see results." : "Hidden — students CANNOT see results yet.";
    toggle.onchange=async()=>{
      const val=!!toggle.checked;
      await writeGlobalResultsPublished(val);
      if(status) status.textContent = val ? "Published — students can see results." : "Hidden — students CANNOT see results yet.";
      toast(val ? "Results are now visible globally." : "Results are now hidden globally.", "ok");
    };
  }catch(e){ console.error("Toggle init failed:",e); }
}

let classToggleRunToken = 0;
async function initClassResultsToggle(){
  const table=document.getElementById('class-publish-table'); if(!table) return;

  const myToken = ++classToggleRunToken;
  table.innerHTML = '<tr><td colspan="2" class="muted">Loading…</td></tr>';

  const rows = [];
  for(const c of CLASS_OPTIONS){
    const ref=doc(db,"classes",c.value);
    const snap=await getDoc(ref);
    const published = snap.exists() ? !!snap.data().resultsPublished : false;

    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${c.label}</td><td><input type="checkbox" ${published?'checked':''}></td>`;
    const checkbox=tr.querySelector('input');
    checkbox.addEventListener('change', async()=>{
      await setDoc(ref,{ resultsPublished:checkbox.checked, updatedAt:serverTimestamp() },{ merge:true });
      toast(`${c.label} results are now ${checkbox.checked?'VISIBLE':'HIDDEN'}`, "ok");
    });
    rows.push(tr);
  }
  if (myToken !== classToggleRunToken) return; // a newer run started—abort this one
  table.replaceChildren(...rows);
}

/* =========================
   🧮 Matric number generator
========================= */
async function findMaxSerialForClassYear(clsValue, year) {
  let maxNum = 0;
  const qRef = query(collection(db,"students"), where("class","==",clsValue), where("year","==",year));
  const snap = await getDocs(qRef);
  snap.forEach(docSnap => {
    const parts = (docSnap.id || "").split("-");
    const num = parseInt(parts[2], 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return maxNum;
}
async function nextMatricForClass(clsValue) {
  const code = getClassCode(clsValue);
  if (!code) throw new Error("Invalid class code.");
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${year}-${code}`);

  const desiredSeq = Math.max(1, (await findMaxSerialForClassYear(clsValue, year)) + 1);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const seq = desiredSeq; // always follow existing docs
    if (!snap.exists()) {
      tx.set(counterRef, { next: seq + 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      tx.update(counterRef, { next: seq + 1, updatedAt: serverTimestamp() });
    }
    const serial = String(seq).padStart(3, "0");
    return `MG${code}-${year}-${serial}`;
  });
}

/* =========================
   📝 Registration
========================= */
async function registerStudent(e){
  e.preventDefault();
  if (busy.register) return;
  const btn = e.submitter || document.querySelector('#register-form button[type="submit"]');
  try{
    busy.register=true; setLoading(btn,true);
    const name=document.getElementById('reg-name').value.trim();
    const className=document.getElementById('reg-class').value;
    let fee=parseInt(document.getElementById('reg-fee').value);
    const rawPass=(document.getElementById('reg-pass')?.value.trim() || randomPassword());
    const password=rawPass.toLowerCase();
    if(!name || !className || isNaN(fee)) { toast("Fill all fields.", "error"); return; }
    if(!isValidClass(className)) { toast("Select a valid class.", "error"); return; }
    if(fee<0) fee=0;

    const id=await nextMatricForClass(className);
    const ref=doc(db,"students",id);
    const snap=await getDoc(ref);
    if(snap.exists()) { toast("Matric already exists. Try again.", "error"); return; }

    await setDoc(ref,{ id,name,class:className,fee,paid:0,password, year:CURRENT_YEAR, createdAt:serverTimestamp(),updatedAt:serverTimestamp() });
    document.getElementById('register-form').reset();
    await updateStudentsTable();
    await updateStudentsAutocomplete();

    try { await navigator.clipboard.writeText(`ID: ${id}\nPassword: ${password}`); toast(`Student Registered! 📋 Copied:\n${id}`, "ok", 3000); }
    catch { toast(`Student Registered!\nID: ${id}`, "ok", 2500); }
  }catch(err){ console.error(err); toast("Failed to register.", "error"); }
  finally{ busy.register=false; setLoading(btn,false); }
}

/* =========================
   🧮 Results (single)
========================= */
function calculateGrade(total){ if(total>=70)return'A'; if(total>=60)return'B'; if(total>=50)return'C'; if(total>=45)return'D'; if(total>=40)return'E'; return'F'; }

async function recordResults(e){
  e.preventDefault();
  if (busy.recordSingle) return;
  const btn = e.submitter || document.querySelector('#results-form button[type="submit"]');
  try{
    busy.recordSingle=true; setLoading(btn,true);
    const studentId=document.getElementById('result-student-id').value.trim();
    const subject=document.getElementById('result-subject').value.trim();
    const ca=parseInt(document.getElementById('result-ca').value);
    const exam=parseInt(document.getElementById('result-exam').value);
    if(!studentId || !subject || isNaN(ca) || isNaN(exam)){ toast("Complete all fields.", "error"); return; }

    const sRef=doc(db,"students",studentId); const sSnap=await getDoc(sRef);
    if(!sSnap.exists()){ toast("Student not found.", "error"); return; }

    const total=ca+exam; const grade=calculateGrade(total);
    const rRef=doc(db,"students",studentId,"results",subject);
    await setDoc(rRef,{ subject,ca,exam,total,grade, date:new Date().toLocaleDateString('en-NG'), recordedAt:serverTimestamp() },{ merge:true });

    document.getElementById('results-form').reset();
    toast("Result saved ✅", "ok");
  }catch(err){ console.error(err); toast("Failed to save result.", "error"); }
  finally{ busy.recordSingle=false; setLoading(btn,false); }
}

/* =========================
   📊 Results table (lookup + save all)
========================= */
let currentLookupStudent=null;
document.getElementById('lookup-btn')?.addEventListener('click', async (e)=>{
  if (busy.lookupTable) return;
  try{
    busy.lookupTable=true; setLoading(e.currentTarget,true);
    const studentId=document.getElementById('record-student-id').value.trim();
    if(!studentId){ toast("Enter Student ID.", "error"); return; }
    const sRef=doc(db,"students",studentId); const sSnap=await getDoc(sRef);
    if(!sSnap.exists()){ toast("Student not found.", "error"); return; }

    currentLookupStudent={ id:studentId, ...sSnap.data() };
    document.getElementById('record-student-name').textContent=currentLookupStudent.name;
    document.getElementById('record-student-class').textContent=displayClass(currentLookupStudent.class);
    document.getElementById('record-student-info').style.display='block';
    await buildResultsTableForStudent(currentLookupStudent);
    toast("Loaded subjects for entry.", "ok", 1400);
  }catch(err){ console.error(err); toast("Lookup failed.", "error"); }
  finally{ busy.lookupTable=false; setLoading(e.currentTarget,false,'Lookup'); }
});

async function buildResultsTableForStudent(student){
  const tbody=document.getElementById('record-results-tbody'); if(!tbody) return;
  tbody.innerHTML='';
  const subjects=SUBJECTS_BY_CLASS[student.class] || [];
  const existingSnap=await getDocs(collection(db,"students",student.id,"results"));
  const existing={}; existingSnap.forEach(d=>existing[d.id]=d.data());

  subjects.forEach(sub=>{
    const data=existing[sub] || { ca:'', exam:'', total:'', grade:'' };
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${sub}</td>
      <td><input type="number" class="ca-input" min="0" max="40" value="${data.ca}"></td>
      <td><input type="number" class="exam-input" min="0" max="60" value="${data.exam}"></td>
      <td class="total-cell">${data.total || 0}</td>
      <td class="grade-cell">${data.grade || ''}</td>
    `;
    const caI=tr.querySelector('.ca-input'); const exI=tr.querySelector('.exam-input');
    const totalCell=tr.querySelector('.total-cell'); const gradeCell=tr.querySelector('.grade-cell');
    const recalc=()=>{ const ca=parseInt(caI.value)||0; const ex=parseInt(exI.value)||0; const tot=ca+ex; totalCell.textContent=tot; gradeCell.textContent=calculateGrade(tot); };
    caI.addEventListener('input',recalc); exI.addEventListener('input',recalc);
    tbody.appendChild(tr);
  });

  document.getElementById('results-table-container').style.display='block';
  document.getElementById('save-results-row').style.display='block';
}

document.getElementById('save-results-btn')?.addEventListener('click', async (e)=>{
  if (busy.saveAll) return;
  try{
    busy.saveAll=true; setLoading(e.currentTarget,true);
    if(!currentLookupStudent){ toast("No student selected.", "error"); return; }
    const tbody=document.getElementById('record-results-tbody');
    const rows=tbody?.querySelectorAll('tr') || [];
    const writes=[];
    for(const row of rows){
      const subject=row.cells[0].textContent;
      const ca=parseInt(row.querySelector('.ca-input').value)||0;
      const exam=parseInt(row.querySelector('.exam-input').value)||0;
      const total=ca+exam; const grade=calculateGrade(total);
      const ref=doc(db,"students",currentLookupStudent.id,"results",subject);
      writes.push(setDoc(ref,{ subject,ca,exam,total,grade, date:new Date().toLocaleDateString('en-NG'), recordedAt:serverTimestamp() },{ merge:true }));
    }
    await Promise.all(writes);
    toast("All results saved ✅", "ok");
  }catch(err){ console.error(err); toast("Some results failed to save.", "error"); }
  finally{ busy.saveAll=false; setLoading(e.currentTarget,false,'Save All'); }
});

/* =========================
   🏆 Positions
========================= */
async function listResults(studentId){
  const qRef=query(collection(db,"students",studentId,"results"), orderBy("subject"));
  const snap=await getDocs(qRef); const arr=[]; snap.forEach(d=>arr.push(d.data())); return arr;
}
async function getLatestResult(studentId){
  try{
    const qRef=query(collection(db,"students",studentId,"results"), orderBy("recordedAt","desc"), limit(1));
    const snap=await getDocs(qRef); const docs=[]; snap.forEach(d=>docs.push(d.data())); if(docs.length) return docs[0];
  }catch{}
  const all=await listResults(studentId); return all[all.length-1] || null;
}
async function generatePositionsForClass(className){
  const qRef=query(collection(db,"students"), where("class","==",className));
  const snap=await getDocs(qRef); const students=[];
  for(const d of snap.docs){
    const s=d.data(); const res=await listResults(s.id);
    const totalMarks=res.reduce((sum,r)=>sum+(r.total||0),0);
    students.push({ id:s.id, totalMarks });
  }
  students.sort((a,b)=>b.totalMarks-a.totalMarks);
  for(let i=0;i<students.length;i++){
    await updateDoc(doc(db,"students",students[i].id), { position:i+1 });
  }
}
async function generatePositionsAllClasses(){
  try{
    for(const c of CLASS_OPTIONS){ await generatePositionsForClass(c.value); }
    toast("Positions generated for all classes ✅", "ok");
  }catch(e){ console.error(e); toast("Failed to generate positions.", "error"); }
}

/* =========================
   👤 Student lookup (student side)
========================= */
async function lookupStudent(e){
  e.preventDefault();
  const studentId=(document.getElementById('student-id')?.value || '').trim();
  const inputPass=(document.getElementById('student-pass')?.value || '').trim();

  if(!studentId || !inputPass){
    showError('student-error','⚠️ Please enter both Student ID and Password.');
    document.getElementById('student-profile').style.display='none';
    return;
  }

  const sRef=doc(db,"students",studentId);
  const sSnap=await getDoc(sRef);
  if(!sSnap.exists()){
    showError('student-error','❌ Student ID not found.');
    document.getElementById('student-profile').style.display='none';
    return;
  }
  const student=sSnap.data();
  const saved=(student.password||'').toLowerCase();
  const entered=inputPass.toLowerCase();
  if(!saved || saved!==entered){
    showError('student-error','❌ Invalid password.');
    document.getElementById('student-profile').style.display='none';
    return;
  }

  const published=await readGlobalResultsPublished();
  const classRef=doc(db,"classes",student.class); const classSnap=await getDoc(classRef);
  const classPublished=classSnap.exists()? !!classSnap.data().resultsPublished : false;

  if(!published || !classPublished){
    setResultsNotice(true,"Results are not yet released for your class.");
    showStudentProfile(student,[]);
    hideError('student-error'); return;
  }

  const results=await listResults(studentId);
  setResultsNotice(false);
  showStudentProfile(student,results);
  hideError('student-error');
}

function showStudentProfile(student, results=[]){
  document.getElementById('student-name').textContent = student.name ?? '';
  document.getElementById('student-class').textContent = displayClass(student.class);

  const fee=Number(student.fee)||0, paid=Number(student.paid)||0, outstanding=Math.max(fee-paid,0);
  document.getElementById('fee-amount').textContent = `₦${fee.toLocaleString()}`;
  document.getElementById('fee-paid').textContent   = `₦${paid.toLocaleString()}`;
  document.getElementById('fee-outstanding').textContent = `₦${outstanding.toLocaleString()}`;

  const pill=document.getElementById('fee-status'); pill.className='status-pill';
  if(outstanding===0){ pill.classList.add('paid'); pill.textContent='PAID'; }
  else if(paid>0){ pill.classList.add('partial'); pill.textContent='PARTIAL'; }
  else{ pill.classList.add('unpaid'); pill.textContent='UNPAID'; }

  const tbody=document.getElementById('results-tbody'); tbody.innerHTML='';
  if(results.length){
    results.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${r.subject}</td>
        <td>${r.ca}</td>
        <td>${r.exam}</td>
        <td>${r.total}</td>
        <td class="grade-${(r.grade||'').toLowerCase()}">${r.grade}</td>
        <td>${r.date||''}</td>
      `;
      tbody.appendChild(tr);
    });
  }else{
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#666;">No results available</td></tr>';
  }

  const posEl=document.getElementById('student-position');
  if(posEl){ posEl.textContent = (results.length && typeof student.position==='number') ? ordinalSuffix(student.position) : "—"; }
  document.getElementById('student-profile').style.display='block';
}

/* =========================
   🧾 Receipt
========================= */
async function generateReceipt(e){ e.preventDefault(); const id=document.getElementById('receipt-student-id').value.trim(); await buildAndShowReceipt(id); }
async function generateReceiptForStudent(id){ showTab('receipt'); document.getElementById('receipt-student-id').value=id; await buildAndShowReceipt(id); }

async function buildAndShowReceipt(studentId){
  if(!studentId) return toast('Please enter a Student ID.', "error");
  const sSnap=await getDoc(doc(db,"students",studentId)); if(!sSnap.exists()) return toast('Student not found!', "error");
  const s=sSnap.data(); const latest=await getLatestResult(studentId); showReceiptView(s,latest);
}
function showReceiptView(student, latest=null){
  const fee=Number(student.fee)||0, paid=Number(student.paid)||0, outstanding=Math.max(fee-paid,0);
  document.getElementById('receipt-date').textContent=new Date().toLocaleString('en-NG',{dateStyle:'medium', timeStyle:'short'});
  document.getElementById('receipt-id').textContent=student.id;
  document.getElementById('receipt-name').textContent=student.name;
  document.getElementById('receipt-class').textContent=displayClass(student.class);
  document.getElementById('receipt-fee').textContent=`₦${fee.toLocaleString()}`;
  document.getElementById('receipt-paid').textContent=`₦${paid.toLocaleString()}`;
  document.getElementById('receipt-outstanding').textContent=`₦${outstanding.toLocaleString()}`;
  const resultDiv=document.getElementById('receipt-result');
  if(latest){
    resultDiv.innerHTML = `<p><strong>Subject:</strong> ${latest.subject}</p>
      <p><strong>Total Score:</strong> ${latest.total} (Grade: ${latest.grade})</p>
      <p><strong>Date:</strong> ${latest.date||''}</p>`;
  }else{ resultDiv.innerHTML='<p style="color:#666;">No results available</p>'; }
  document.getElementById('receipt-password').textContent=`Student Password: ${student.password || '(not set)'}`;
  document.getElementById('receipt-view').style.display='block';
}
function printReceipt(){ window.print(); }

/* =========================
   📋 Students table (admin)
========================= */
async function updateStudentsTable(){
  const tbody=document.getElementById('students-tbody'); if(!tbody) return; tbody.innerHTML='';
  const snap=await getDocs(collection(db,"students"));
  const list=[]; snap.forEach(d=>list.push(d.data()));
  list.sort((a,b)=> (a.id||'').localeCompare(b.id||''));
  list.forEach(s=>{
    const fee=Number(s.fee)||0, paid=Number(s.paid)||0, out=Math.max(fee-paid,0);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${s.id}</td>
      <td>${s.name}</td>
      <td>${displayClass(s.class)}</td>
      <td>₦${fee.toLocaleString()}</td>
      <td>₦${paid.toLocaleString()}</td>
      <td>₦${out.toLocaleString()}</td>
      <td class="action-cell">
        <button onclick="generateReceiptForStudent('${s.id}')" class="btn btn-primary btn-sm">Receipt</button>
        <button onclick="editStudent('${s.id}')" class="btn btn-outline btn-sm">Edit</button>
        <button onclick="deleteStudent('${s.id}')" class="btn btn-danger btn-sm">Delete</button>
        <button onclick="promoteSingleStudent('${s.id}')" class="btn btn-warning btn-sm">Promote</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
async function updateStudentsAutocomplete(){
  const list1=document.getElementById('students-list');
  const list2=document.getElementById('students-list-receipt');
  if(!list1 || !list2) return;
  const snap=await getDocs(collection(db,"students")); let opts='';
  const ids = []; snap.forEach(d=> ids.push(d.id));
  ids.sort().forEach(id => { opts += `<option value="${id}"></option>`; });
  list1.innerHTML=opts; list2.innerHTML=opts;
}

/* =========================
   ✏️ Edit / Save / Delete
========================= */
let currentEditingStudentId=null;

async function editStudent(studentId){
  const ref=doc(db,"students",studentId); const snap=await getDoc(ref);
  if(!snap.exists()) return toast("Student not found.", "error");
  const s=snap.data(); currentEditingStudentId=studentId;
  document.getElementById('edit-name').value=s.name||'';
  document.getElementById('edit-class').value=isValidClass(s.class)? s.class : CLASS_OPTIONS[0].value;
  document.getElementById('edit-fee').value=Number(s.fee)||0;
  document.getElementById('edit-paid').value=Number(s.paid)||0;
  document.getElementById('edit-modal').classList.add('show');
}
function closeEditModal(){ document.getElementById('edit-modal').classList.remove('show'); currentEditingStudentId=null; }

async function saveStudentEdit(e){
  e.preventDefault(); if(!currentEditingStudentId) return;
  const name=document.getElementById('edit-name').value.trim();
  const cls=document.getElementById('edit-class').value;
  let fee=parseInt(document.getElementById('edit-fee').value);
  let paid=parseInt(document.getElementById('edit-paid').value);
  if(!isValidClass(cls)) return toast('Select a valid class.', "error");
  fee=isNaN(fee)?0:fee; paid=isNaN(paid)?0:paid; if(paid>fee) paid=fee;
  await updateDoc(doc(db,"students",currentEditingStudentId),{ name, class:cls, fee, paid, updatedAt:serverTimestamp() });
  await updateStudentsTable(); await updateStudentsAutocomplete(); closeEditModal(); toast('Student updated ✅', "ok");
}
async function deleteStudent(studentId){
  if(!confirm('Delete this student?')) return;
  try{
    const rSnap=await getDocs(collection(db,"students",studentId,"results"));
    const deletions=[]; rSnap.forEach(d=>deletions.push(deleteDoc(doc(db,"students",studentId,"results",d.id))));
    await Promise.all(deletions);
  }catch{}
  await deleteDoc(doc(db,"students",studentId));
  await updateStudentsTable(); await updateStudentsAutocomplete();
  toast('Student deleted', "info");
}

/* =========================
   ⬆️ Promotion
========================= */
function nextClass(current){ if(current==="Ibtidaiyah")return"Idadiyah"; if(current==="Idadiyah")return"Thanawiyah"; return null; }

async function snapshotOldResults(oldId,newId){
  const resSnap=await getDocs(collection(db,"students",oldId,"results"));
  const writes=[]; resSnap.forEach(r=>{ const data=r.data(); const historyResRef=doc(db,"students",newId,"history",oldId,"results",r.id); writes.push(setDoc(historyResRef,data)); });
  await Promise.all(writes);
}
async function promoteSingleStudent(studentId){
  const sRef=doc(db,"students",studentId); const sSnap=await getDoc(sRef);
  if(!sSnap.exists()) return toast("Student not found.", "error");
  const s=sSnap.data(); const next=nextClass(s.class);
  if(!next) return toast("🎓 Final class reached (Thanawiyah).", "info");

  const newId=await nextMatricForClass(next);
  const newRef=doc(db,"students",newId);
  await setDoc(newRef,{ id:newId, name:s.name, class:next, fee:s.fee||0, paid:s.paid||0, password:s.password||randomPassword(), year:CURRENT_YEAR, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  await setDoc(doc(db,"students",newId,"history",studentId),{ id:studentId, name:s.name, class:s.class, fee:s.fee||0, paid:s.paid||0, password:s.password||null, year:s.year||null, promotedAt:serverTimestamp() });
  await snapshotOldResults(studentId,newId);
  await deleteDoc(sRef);

  toast(`Promoted: ${s.name}\nNew ID: ${newId}`, "ok", 2800);
  await updateStudentsTable(); await updateStudentsAutocomplete();
}
async function promoteEntireClass(classValue){
  if(!isValidClass(classValue)) return toast("Select a valid class.", "error");
  const next=nextClass(classValue); if(!next) return toast("This class is final — cannot promote further.", "info");
  const qRef=query(collection(db,"students"), where("class","==",classValue));
  const snap=await getDocs(qRef); if(snap.empty) return toast("No students found in this class.", "info");
  if(!confirm(`Promote ALL students in ${displayClass(classValue)} to ${displayClass(next)}?`)) return;
  for(const d of snap.docs){ try{ await promoteSingleStudent(d.id); }catch(e){ console.error("Promotion failed for", d.id, e); } }
  toast(`Finished promoting ${displayClass(classValue)}.`, "ok");
}

/* =========================
   ⚠️ Error helpers
========================= */
function showError(id,msg){ const el=document.getElementById(id); if(!el) return; el.textContent=msg; el.classList.add('show'); }
function hideError(id){ const el=document.getElementById(id); if(!el) return; el.classList.remove('show'); }

/* =========================
   🌱 Expose to window
========================= */
Object.assign(window,{
  showStudentLogin, showAdminLogin, showLanding, showTab,
  lookupStudent,
  adminLogin, adminLogout,
  registerStudent, recordResults,
  generateReceipt, generateReceiptForStudent, printReceipt,
  updateStudentsTable, updateStudentsAutocomplete,
  editStudent, saveStudentEdit, deleteStudent, closeEditModal,
  generatePositionsAllClasses,
  promoteSingleStudent, promoteEntireClass
});

/* =========================
   🚀 Boot
========================= */
document.addEventListener('DOMContentLoaded', ()=>{ populateClassSelects(); });
// When dashboard opens, also render counters (and set default year)


// Hook up the buttons once
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('counters-year');
  const syncBtn  = document.getElementById('sync-counters-btn');
  const resetBtn = document.getElementById('reset-empty-btn');
  y?.addEventListener('change', renderCountersTable);
  syncBtn?.addEventListener('click', syncAllCountersWithStudents);
  resetBtn?.addEventListener('click', resetEmptyClassYearsTo001);
});


/* =========================
   🧪 Console error surfacing
========================= */
window.addEventListener('error', (e) => { console.group('%cGlobal Error','color:#f33'); console.error(e.error||e.message); console.log('at',e.filename,'line:',e.lineno,'col:',e.colno); console.groupEnd(); });
window.addEventListener('unhandledrejection', (e) => { console.group('%cUnhandled Promise Rejection','color:#f33'); console.error(e.reason); console.groupEnd(); });
 

/* =========================
   🧮 Counter utilities
========================= */
function counterDocId(year, clsValue) {
  const code = getClassCode(clsValue);
  return `${year}-${code}`; // e.g. "2025-IBT"
}

async function readCounterNext(year, clsValue) {
  const id = counterDocId(year, clsValue);
  const snap = await getDoc(doc(db, "counters", id));
  return snap.exists() ? (snap.data().next ?? 1) : null;
}

async function writeCounterNext(year, clsValue, nextVal) {
  const id = counterDocId(year, clsValue);
  await setDoc(
    doc(db, "counters", id),
    { next: Number(nextVal), updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
    { merge: true }
  );
}

/* =========================
   📋 Counters table render
========================= */
async function renderCountersTable() {
  const yearInput = document.getElementById('counters-year');
  const tbody = document.getElementById('counters-tbody');
  if (!yearInput || !tbody) return;

  const year = Number(yearInput.value) || new Date().getFullYear();
  const rows = [];

  for (const c of CLASS_OPTIONS) {
    const maxSerial = await findMaxSerialForClassYear(c.value, year); // highest existing for this class+year
    const desiredNext = Math.max(1, maxSerial + 1);

    const currentNext = await readCounterNext(year, c.value); // may be null if not created
    const showNext = currentNext ?? '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.label}</td>
      <td><code>${showNext}</code> <span class="muted" style="margin-left:.5rem">desired: ${String(desiredNext).padStart(3,'0')}</span></td>
      <td>
        <button class="btn btn-outline btn-sm fix-btn">Fix</button>
      </td>
    `;

    tr.querySelector('.fix-btn').addEventListener('click', async () => {
      await writeCounterNext(year, c.value, desiredNext + 1); // counter stores "next", so +1
      toast(`${c.label}: counter set to ${String(desiredNext+1).padStart(3, '0')}`, "ok");
      await renderCountersTable();
    });

    rows.push(tr);
  }
  tbody.replaceChildren(...rows);
}

/* =========================
   🔄 Bulk actions
========================= */
async function syncAllCountersWithStudents() {
  const year = Number(document.getElementById('counters-year').value) || new Date().getFullYear();

  for (const c of CLASS_OPTIONS) {
    const maxSerial = await findMaxSerialForClassYear(c.value, year);
    const desiredNext = Math.max(1, maxSerial + 1);
    await writeCounterNext(year, c.value, desiredNext + 1);
  }
  toast("All counters synced with students ✅", "ok");
  await renderCountersTable();
}

async function resetEmptyClassYearsTo001() {
  const year = Number(document.getElementById('counters-year').value) || new Date().getFullYear();

  for (const c of CLASS_OPTIONS) {
    const maxSerial = await findMaxSerialForClassYear(c.value, year);
    if (maxSerial === 0) {
      // no students for this class+year → reset counter to 001 (next should be 002)
      await writeCounterNext(year, c.value, 2);
    }
  }
  toast("Empty class-years reset to 001 ✅", "ok");
  await renderCountersTable();
}
