// Home page JavaScript functionality
import { authMethods, firestoreMethods, requireAuth } from './firebase-config.js';
import { serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
// DOM Elements
const darkModeToggle = document.getElementById('darkModeToggle');
const searchInput = document.getElementById('searchInput');
const postInput = document.getElementById('postInput');
const postBtn = document.getElementById('postBtn');
const addPhotoBtn = document.getElementById('addPhotoBtn');
const addVideoBtn = document.getElementById('addVideoBtn');
const addLocationBtn = document.getElementById('addLocationBtn');
const postsFeed = document.getElementById('postsFeed');
const profileBtn = document.getElementById('profileBtn');
const notificationsBtn = document.getElementById('notificationsBtn');
const messagesBtn = document.getElementById('messagesBtn');

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    try {
        // Check authentication
        const user = await requireAuth();
        
        // Initialize UI
        initializeDarkMode();
        setupEventListeners();
        loadUserProfile();
        loadPosts();
        
    } catch (error) {
        console.error('Authentication error:', error);
        window.location.href = 'index.html';
    }
}

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
    
    // Navigation
    profileBtn.addEventListener('click', () => window.location.href = 'profile.html');
    
    // Search functionality
    searchInput.addEventListener('input', handleSearch);
    
    // Post creation
    postBtn.addEventListener('click', handleCreatePost);
    addPhotoBtn.addEventListener('click', handleAddPhoto);
    addVideoBtn.addEventListener('click', handleAddVideo);
    addLocationBtn.addEventListener('click', handleAddLocation);
    
    // Notifications and messages (placeholder)
    notificationsBtn.addEventListener('click', handleNotifications);
    messagesBtn.addEventListener('click', handleMessages);
}

// User profile loading
async function loadUserProfile() {
    try {
        // TODO: Implement actual user profile loading from Firebase
        const user = authMethods.auth?.currentUser;
        if (user) {
            const userProfile = await firestoreMethods.getUserProfile(user.uid);
            // Update UI with user profile data
            console.log('User profile loaded:', userProfile);
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Posts loading and management
async function loadPosts() {
    try {
        // TODO: Implement actual posts loading from Firebase
        const unsubscribe = firestoreMethods.getPosts((querySnapshot) => {
            const posts = [];
            querySnapshot.forEach((doc) => {
                posts.push({ id: doc.id, ...doc.data() });
            });
            renderPosts(posts);
        });
        
        // Store unsubscribe function for cleanup
        window.unsubscribePosts = unsubscribe;
        
    } catch (error) {
        console.error('Error loading posts:', error);
        // For now, keep the sample posts
    }
}

function renderPosts(posts) {
    // Clear existing posts (except sample ones for now)
    // postsFeed.innerHTML = '';
    
    // TODO: Implement actual post rendering
    posts.forEach(post => {
        const postElement = createPostElement(post);
        postsFeed.appendChild(postElement);
        postsFeed.innerHTML = ''; // clear existing posts

    });
}

function createPostElement(post) {
    // TODO: Create dynamic post elements
    const postDiv = document.createElement('div');
    postDiv.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden';
    postDiv.innerHTML = `
        <div class="p-6">
            <div class="flex items-center mb-4">
                <div class="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 overflow-hidden">
                    <img src="${post.authorPhoto || 'images/default-profile.jpg'}" alt="Profile photo of ${post.authorName || 'user'}" class="w-full h-full object-cover">
                </div>
                <div class="ml-3 flex-1">
                    <h4 class="font-semibold text-gray-900 dark:text-white">${post.authorName}</h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${formatDate(post.createdAt)}</p>
                </div>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
            </div>
            <p class="text-gray-700 dark:text-gray-300 mb-4">${post.content}</p>
            ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Post image" class="w-full rounded-xl">` : ''}
        </div>
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="flex space-x-6">
                    <button class="flex items-center text-gray-500 hover:text-red-500 transition-colors duration-200">
                        <i class="far fa-heart mr-2"></i>
                        <span>${post.likes || 0}</span>
                    </button>
                    <button class="flex items-center text-gray-500 hover:text-blue-500 transition-colors duration-200">
                        <i class="far fa-comment mr-2"></i>
                        <span>${post.comments || 0}</span>
                    </button>
                    <button class="flex items-center text-gray-500 hover:text-green-500 transition-colors duration-200">
                        <i class="fas fa-share mr-2"></i>
                        <span>Share</span>
                    </button>
                </div>
                <button class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="far fa-bookmark"></i>
                </button>
            </div>
        </div>
    `;
    
    return postDiv;
}

// Post creation handlers
async function handleCreatePost() {
    const content = postInput.value.trim();
    
    if (!content) {
        showErrorMessage('Please enter some content for your post.');
        return;
    }
    
    try {
        // Show loading state
        postBtn.textContent = 'Posting...';
        postBtn.disabled = true;
        
        // TODO: Implement actual post creation
   const user = await requireAuth();
const userProfileDoc = await firestoreMethods.getUserProfile(user.uid);
const userProfile = userProfileDoc.data();

const postData = {
    content,
    authorId: user.uid,
    authorName: userProfile?.name || 'Anonymous',
    authorPhoto: userProfile?.photoURL || '',
    createdAt: serverTimestamp(),
    likes: 0,
    comments: 0,
    shares: 0
};


  await firestoreMethods.createPost(postData);
        
        // Clear input
        postInput.value = '';
        showSuccessMessage('Post created successfully!');
        
    } catch (error) {
        console.error('Error creating post:', error);
        showErrorMessage('Failed to create post. Please try again.');
    } finally {
        // Reset button state
        postBtn.textContent = 'Post';
        postBtn.disabled = false;
    }
}

function handleAddPhoto() {
    // TODO: Implement photo upload
    console.log('Add photo clicked');
    showInfoMessage('Photo upload feature coming soon!');
}

function handleAddVideo() {
    // TODO: Implement video upload
    console.log('Add video clicked');
    showInfoMessage('Video upload feature coming soon!');
}

function handleAddLocation() {
    // TODO: Implement location sharing
    console.log('Add location clicked');
    showInfoMessage('Location sharing feature coming soon!');
}

// Search functionality
function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    // TODO: Implement actual search functionality
    console.log('Search query:', query);
}

// Navigation handlers
function handleNotifications() {
    // TODO: Implement notifications
    console.log('Notifications clicked');
    showInfoMessage('Notifications feature coming soon!');
}

function handleMessages() {
    // TODO: Implement messages
    console.log('Messages clicked');
    showInfoMessage('Messages feature coming soon!');
}

// Utility functions
function formatDate(timestamp) {
    if (!timestamp || !timestamp.toDate) return 'Unknown date';
    const date = timestamp.toDate();
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    if (diffInHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
}

function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    successDiv.textContent = message;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 5000);
}

function showInfoMessage(message) {
    const infoDiv = document.createElement('div');
    infoDiv.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    infoDiv.textContent = message;
    
    document.body.appendChild(infoDiv);
    
    setTimeout(() => {
        infoDiv.remove();
    }, 3000);
}

// Cleanup function
window.addEventListener('beforeunload', () => {
    if (window.unsubscribePosts) {
        window.unsubscribePosts();
    }
});

