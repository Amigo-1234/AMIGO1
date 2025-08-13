// Data storage and initialization
let studentsData = {};
let isAdminLoggedIn = false;
let currentEditingStudentId = null;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeData();
    checkAdminSession();
    updateStudentsAutocomplete();
});

// Initialize seed data
function initializeData() {
    const existingData = localStorage.getItem('markazStudentsData');
    
    if (!existingData) {
        // Seed data
        const seedData = {
            'MIG-2025-001': {
                id: 'MIG-2025-001',
                name: 'Amina Yusuf',
                class: 'Arabic 1',
                fee: 25000,
                paid: 15000,
                results: [
                    {
                        subject: 'Tajweed',
                        ca: 30,
                        exam: 50,
                        total: 80,
                        grade: 'A',
                        date: new Date().toLocaleDateString()
                    }
                ]
            },
            'MIG-2025-002': {
                id: 'MIG-2025-002',
                name: 'Muhammad Ali',
                class: 'Tahfeedh 2',
                fee: 25000,
                paid: 25000,
                results: [
                    {
                        subject: 'Nahw',
                        ca: 25,
                        exam: 34,
                        total: 59,
                        grade: 'C',
                        date: new Date().toLocaleDateString()
                    }
                ]
            }
        };
        
        localStorage.setItem('markazStudentsData', JSON.stringify(seedData));
        studentsData = seedData;
    } else {
        studentsData = JSON.parse(existingData);
    }
}

// Save data to localStorage
function saveData() {
    localStorage.setItem('markazStudentsData', JSON.stringify(studentsData));
}

// Check admin session
function checkAdminSession() {
    isAdminLoggedIn = localStorage.getItem('markazAdminSession') === 'true';
}

// Navigation functions
function showLanding() {
    hideAllPages();
    document.getElementById('landing-page').classList.add('active');
}

function showStudentLogin() {
    hideAllPages();
    document.getElementById('student-page').classList.add('active');
    document.getElementById('student-form').reset();
    document.getElementById('student-profile').style.display = 'none';
    hideError('student-error');
}

function showAdminLogin() {
    if (isAdminLoggedIn) {
        showAdminDashboard();
        return;
    }
    hideAllPages();
    document.getElementById('admin-login-page').classList.add('active');
    document.getElementById('admin-form').reset();
    hideError('admin-error');
}

function showAdminDashboard() {
    hideAllPages();
    document.getElementById('admin-dashboard').classList.add('active');
    showTab('register');
    updateStudentsTable();
    updateStudentsAutocomplete();
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
}

// Student lookup
function lookupStudent(event) {
    event.preventDefault();
    
    const studentId = document.getElementById('student-id').value.trim();
    const student = studentsData[studentId];
    
    if (student) {
        showStudentProfile(student);
        hideError('student-error');
    } else {
        showError('student-error', 'Student ID not found.');
        document.getElementById('student-profile').style.display = 'none';
    }
}

function showStudentProfile(student) {
    // Profile info
    document.getElementById('student-name').textContent = student.name;
    document.getElementById('student-class').textContent = student.class;
    
    // Fees info
    const outstanding = student.fee - student.paid;
    document.getElementById('fee-amount').textContent = `₦${student.fee.toLocaleString()}`;
    document.getElementById('fee-paid').textContent = `₦${student.paid.toLocaleString()}`;
    document.getElementById('fee-outstanding').textContent = `₦${outstanding.toLocaleString()}`;
    
    // Fee status
    const statusPill = document.getElementById('fee-status');
    statusPill.className = 'status-pill';
    if (outstanding === 0) {
        statusPill.classList.add('paid');
        statusPill.textContent = 'PAID';
    } else if (student.paid > 0) {
        statusPill.classList.add('partial');
        statusPill.textContent = 'PARTIAL';
    } else {
        statusPill.classList.add('unpaid');
        statusPill.textContent = 'UNPAID';
    }
    
    // Results table
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    
    if (student.results && student.results.length > 0) {
        student.results.forEach(result => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${result.subject}</td>
                <td>${result.ca}</td>
                <td>${result.exam}</td>
                <td>${result.total}</td>
                <td class="grade-${result.grade.toLowerCase()}">${result.grade}</td>
                <td>${result.date}</td>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">No results available</td></tr>';
    }
    
    document.getElementById('student-profile').style.display = 'block';
}

// Admin login
function adminLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    
    if (email === 'admin@markaz.com' && password === 'admin123') {
        isAdminLoggedIn = true;
        localStorage.setItem('markazAdminSession', 'true');
        showAdminDashboard();
        hideError('admin-error');
    } else {
        showError('admin-error', 'Invalid credentials. Use admin@markaz.com / admin123');
    }
}

function adminLogout() {
    isAdminLoggedIn = false;
    localStorage.removeItem('markazAdminSession');
    showLanding();
}

// Tab management
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Add active class to selected tab button
    event.target.classList.add('active');
    
    // Update data when switching tabs
    if (tabName === 'students') {
        updateStudentsTable();
    }
}

// Register student
function registerStudent(event) {
    event.preventDefault();
    
    const id = document.getElementById('reg-id').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const className = document.getElementById('reg-class').value;
    const fee = parseInt(document.getElementById('reg-fee').value);
    
    if (studentsData[id]) {
        alert('Student ID already exists!');
        return;
    }
    
    studentsData[id] = {
        id: id,
        name: name,
        class: className,
        fee: fee,
        paid: 0,
        results: []
    };
    
    saveData();
    updateStudentsAutocomplete();
    document.getElementById('register-form').reset();
    alert('Student registered successfully!');
}

// Record results
function recordResults(event) {
    event.preventDefault();
    
    const studentId = document.getElementById('result-student-id').value.trim();
    const subject = document.getElementById('result-subject').value.trim();
    const ca = parseInt(document.getElementById('result-ca').value);
    const exam = parseInt(document.getElementById('result-exam').value);
    
    if (!studentsData[studentId]) {
        alert('Student not found!');
        return;
    }
    
    const total = ca + exam;
    const grade = calculateGrade(total);
    
    const result = {
        subject: subject,
        ca: ca,
        exam: exam,
        total: total,
        grade: grade,
        date: new Date().toLocaleDateString()
    };
    
    studentsData[studentId].results.push(result);
    saveData();
    document.getElementById('results-form').reset();
    alert('Results recorded successfully!');
}

// Calculate grade
function calculateGrade(total) {
    if (total >= 70) return 'A';
    if (total >= 60) return 'B';
    if (total >= 50) return 'C';
    if (total >= 45) return 'D';
    if (total >= 40) return 'E';
    return 'F';
}

// Update students table
function updateStudentsTable() {
    const tbody = document.getElementById('students-tbody');
    tbody.innerHTML = '';
    
    Object.values(studentsData).forEach(student => {
        const outstanding = student.fee - student.paid;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.class}</td>
            <td>₦${student.fee.toLocaleString()}</td>
            <td>₦${student.paid.toLocaleString()}</td>
            <td>₦${outstanding.toLocaleString()}</td>
            <td>
                <button onclick="generateReceiptForStudent('${student.id}')" class="btn btn-primary btn-sm">Receipt</button>
                <button onclick="editStudent('${student.id}')" class="btn btn-outline btn-sm">Edit</button>
                <button onclick="deleteStudent('${student.id}')" class="btn btn-danger btn-sm">Delete</button>
            </td>
        `;
    });
}

// Update autocomplete lists
function updateStudentsAutocomplete() {
    const datalist1 = document.getElementById('students-list');
    const datalist2 = document.getElementById('students-list-receipt');
    
    const options = Object.keys(studentsData).map(id => `<option value="${id}">`).join('');
    datalist1.innerHTML = options;
    datalist2.innerHTML = options;
}

// Edit student
function editStudent(studentId) {
    const student = studentsData[studentId];
    if (!student) return;
    
    currentEditingStudentId = studentId;
    
    document.getElementById('edit-name').value = student.name;
    document.getElementById('edit-class').value = student.class;
    document.getElementById('edit-fee').value = student.fee;
    document.getElementById('edit-paid').value = student.paid;
    
    document.getElementById('edit-modal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    currentEditingStudentId = null;
}

function saveStudentEdit(event) {
    event.preventDefault();
    
    if (!currentEditingStudentId) return;
    
    const student = studentsData[currentEditingStudentId];
    student.name = document.getElementById('edit-name').value.trim();
    student.class = document.getElementById('edit-class').value;
    student.fee = parseInt(document.getElementById('edit-fee').value);
    student.paid = parseInt(document.getElementById('edit-paid').value);
    
    saveData();
    updateStudentsTable();
    closeEditModal();
    alert('Student updated successfully!');
}

// Delete student
function deleteStudent(studentId) {
    if (confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
        delete studentsData[studentId];
        saveData();
        updateStudentsTable();
        updateStudentsAutocomplete();
    }
}

// Receipt generation
function generateReceipt(event) {
    event.preventDefault();
    
    const studentId = document.getElementById('receipt-student-id').value.trim();
    const student = studentsData[studentId];
    
    if (!student) {
        alert('Student not found!');
        return;
    }
    
    showReceiptView(student);
}

function generateReceiptForStudent(studentId) {
    const student = studentsData[studentId];
    if (!student) return;
    
    showTab('receipt');
    document.getElementById('receipt-student-id').value = studentId;
    showReceiptView(student);
}

function showReceiptView(student) {
    const outstanding = student.fee - student.paid;
    
    document.getElementById('receipt-date').textContent = new Date().toLocaleString();
    document.getElementById('receipt-id').textContent = student.id;
    document.getElementById('receipt-name').textContent = student.name;
    document.getElementById('receipt-class').textContent = student.class;
    document.getElementById('receipt-fee').textContent = `₦${student.fee.toLocaleString()}`;
    document.getElementById('receipt-paid').textContent = `₦${student.paid.toLocaleString()}`;
    document.getElementById('receipt-outstanding').textContent = `₦${outstanding.toLocaleString()}`;
    
    const resultDiv = document.getElementById('receipt-result');
    if (student.results && student.results.length > 0) {
        const latestResult = student.results[student.results.length - 1];
        resultDiv.innerHTML = `
            <p><strong>Subject:</strong> ${latestResult.subject}</p>
            <p><strong>Total Score:</strong> ${latestResult.total} (Grade: ${latestResult.grade})</p>
            <p><strong>Date:</strong> ${latestResult.date}</p>
        `;
    } else {
        resultDiv.innerHTML = '<p style="color: #666;">No results available</p>';
    }
    
    document.getElementById('receipt-view').style.display = 'block';
}

function printReceipt() {
    window.print();
}

// Utility functions
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    errorElement.classList.remove('show');
}

// Event delegation for tab buttons
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('tab-btn')) {
        const tabName = event.target.textContent.toLowerCase().replace(' ', '');
        const tabMap = {
            'registerstudent': 'register',
            'recordresults': 'results',
            'studentslist': 'students',
            'receipt': 'receipt'
        };
        
        showTab(tabMap[tabName] || tabName);
    }
});

// Close modal when clicking outside
document.getElementById('edit-modal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeEditModal();
    }
});

