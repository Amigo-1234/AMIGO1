// Firebase Configuration
// TODO: Replace with your actual Firebase config
// Firebase Configuration using your real details
const firebaseConfig = {
  apiKey: "AIzaSyDnhUN969S-rFqc25YVdQ06ggvJC07ee5g",
  authDomain: "haqslam-e2e7a.firebaseapp.com",
  projectId: "haqslam-e2e7a",
  storageBucket: "haqslam-e2e7a.appspot.com", // FIXED: should be .appspot.com, not .firebasestorage.app
  messagingSenderId: "1030780989904",
  appId: "1:1030780989904:web:f7e5e8a2d2fba6f26bc9d5",
  measurementId: "G-PH08SNHJ8G"
};

// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export Firebase services for use in other modules
export { auth, db, storage, getAuth };
// Firebase Auth Methods
export const authMethods = {
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signUp: (email, password) => createUserWithEmailAndPassword(auth, email, password),
  signOut: () => signOut(auth),
  onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback)
};

// Firebase Firestore Methods
export const firestoreMethods = {
  // User profile operations
  createUserProfile: (userId, userData) => setDoc(doc(db, 'users', userId), userData),
  getUserProfile: (userId) => getDoc(doc(db, 'users', userId)),
  
  // Post operations
  createPost: (postData) => addDoc(collection(db, 'posts'), postData),
  getPosts: (callback) => {
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    return onSnapshot(postsQuery, callback);
  },
  
  // Generic document operations
  setDocument: (collectionName, docId, data) => setDoc(doc(db, collectionName, docId), data),
  getDocument: (collectionName, docId) => getDoc(doc(db, collectionName, docId))
};

// Firebase Storage Methods
export const storageMethods = {
  uploadFile: (path, file) => {
    const storageRef = ref(storage, path);
    return uploadBytes(storageRef, file);
  },
  getDownloadURL: (path) => {
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  }
};

// Auth state checker - redirect to login if not authenticated
export const requireAuth = () => {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user);
      } else {
        // Redirect to login page
        window.location.href = 'index.html';
        reject('User not authenticated');
      }
    });
  });
};

// Check if user is authenticated and redirect accordingly
export const checkAuthAndRedirect = () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in, redirect to home if on login page
      if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        window.location.href = 'home.html';
      }
    } else {
      // User is signed out, redirect to login if on protected pages
      if (window.location.pathname.includes('home.html') || window.location.pathname.includes('profile.html')) {
        window.location.href = 'index.html';
      }
    }
  });
};

