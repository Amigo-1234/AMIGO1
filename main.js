// Main JavaScript file for index.html (Login/Signup page)
import { authMethods, firestoreMethods, checkAuthAndRedirect } from './firebase-config.js';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignupBtn = document.getElementById('showSignupForm');
const showLoginBtn = document.getElementById('showLoginForm');
const darkModeToggle = document.getElementById('darkModeToggle');

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    initializeDarkMode();
    setupEventListeners();
    checkAuthAndRedirect();
});

// Dark mode functionality
function initializeDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        updateDarkModeIcon(true);
    }
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
    const icon = darkModeToggle.querySelector('i');
    icon.className = isDark ? 'fas fa-sun text-gray-300' : 'fas fa-moon text-gray-600';
}

// Event listeners
function setupEventListeners() {
    // Dark mode toggle
    darkModeToggle.addEventListener('click', toggleDarkMode);
    
    // Form toggles
    showSignupBtn.addEventListener('click', showSignupForm);
    showLoginBtn.addEventListener('click', showLoginForm);
    
    // Form submissions
    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
}

// Form display functions
function showSignupForm() {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
}

function showLoginForm() {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
}

// Authentication handlers
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    
    try {
        // Show loading state
        loginBtn.textContent = 'Signing In...';
        loginBtn.disabled = true;
        
        // TODO: Implement actual Firebase authentication
        const userCredential = await authMethods.signIn(email, password);
        
        // Success - redirect to home
        window.location.href = 'home.html';
        
    } catch (error) {
        console.error('Login error:', error);
        showErrorMessage('Invalid email or password. Please try again.');
    } finally {
        // Reset button state
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled = false;
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('signupFirstName').value;
    const lastName = document.getElementById('signupLastName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const signupBtn = document.getElementById('signupBtn');
    
    // Validate passwords match
    if (password !== confirmPassword) {
        showErrorMessage('Passwords do not match.');
        return;
    }
    
    try {
        // Show loading state
        signupBtn.textContent = 'Creating Account...';
        signupBtn.disabled = true;
        
        // TODO: Implement actual Firebase authentication
        const userCredential = await authMethods.signUp(email, password);
        
        // Create user profile in Firestore
        const userData = {
            firstName,
            lastName,
            email,
            displayName: `${firstName} ${lastName}`,
            bio: '',
            profilePicture: '',
            createdAt: new Date().toISOString(),
            followers: 0,
            following: 0,
            posts: 0
        };
        
        await firestoreMethods.createUserProfile(userCredential.user.uid, userData);
        
        // Success - redirect to home
        window.location.href = 'home.html';
        
    } catch (error) {
        console.error('Signup error:', error);
        showErrorMessage('Failed to create account. Please try again.');
    } finally {
        // Reset button state
        signupBtn.textContent = 'Create Account';
        signupBtn.disabled = false;
    }
}

// Utility functions
function showErrorMessage(message) {
    // Create and show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    // Remove error message after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccessMessage(message) {
    // Create and show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    successDiv.textContent = message;
    
    document.body.appendChild(successDiv);
    
    // Remove success message after 5 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 5000);
}

// For development/testing - remove in production
window.testLogin = () => {
    document.getElementById('loginEmail').value = 'test@example.com';
    document.getElementById('loginPassword').value = 'password123';
};

window.testSignup = () => {
    document.getElementById('signupFirstName').value = 'John';
    document.getElementById('signupLastName').value = 'Doe';
    document.getElementById('signupEmail').value = 'john@example.com';
    document.getElementById('signupPassword').value = 'password123';
    document.getElementById('signupConfirmPassword').value = 'password123';
};

