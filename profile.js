// Profile page JavaScript functionality
import { authMethods, firestoreMethods, storageMethods, requireAuth } from './firebase-config.js';

// DOM Elements
const darkModeToggle = document.getElementById('darkModeToggle');
const homeBtn = document.getElementById('homeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const editProfileBtn = document.getElementById('editProfileBtn');
const editCoverBtn = document.getElementById('editCoverBtn');
const editProfilePicBtn = document.getElementById('editProfilePicBtn');
const shareProfileBtn = document.getElementById('shareProfileBtn');

// Profile content tabs
const postsTab = document.getElementById('postsTab');
const photosTab = document.getElementById('photosTab');
const videosTab = document.getElementById('videosTab');
const postsContent = document.getElementById('postsContent');
const photosContent = document.getElementById('photosContent');
const videosContent = document.getElementById('videosContent');

// Profile data elements
const profileName = document.getElementById('profileName');
const profileUsername = document.getElementById('profileUsername');
const profileBio = document.getElementById('profileBio');
const profileLocation = document.getElementById('profileLocation');
const profileJoinDate = document.getElementById('profileJoinDate');
const profileWork = document.getElementById('profileWork');
const profileEducation = document.getElementById('profileEducation');
const profileRelationship = document.getElementById('profileRelationship');
const profileWebsite = document.getElementById('profileWebsite');
const profilePicture = document.getElementById('profilePicture');

// Stats elements
const postsCount = document.getElementById('postsCount');
const followersCount = document.getElementById('followersCount');
const followingCount = document.getElementById('followingCount');
const likesCount = document.getElementById('likesCount');

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
        loadUserProfile(user);
        loadUserPosts(user);
        
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
    homeBtn.addEventListener('click', () => window.location.href = 'home.html');
    logoutBtn.addEventListener('click', handleLogout);
    
    // Profile actions
    editProfileBtn.addEventListener('click', handleEditProfile);
    editCoverBtn.addEventListener('click', handleEditCover);
    editProfilePicBtn.addEventListener('click', handleEditProfilePic);
    shareProfileBtn.addEventListener('click', handleShareProfile);
    
    // Tab switching
    postsTab.addEventListener('click', () => switchTab('posts'));
    photosTab.addEventListener('click', () => switchTab('photos'));
    videosTab.addEventListener('click', () => switchTab('videos'));
}

// User profile loading
async function loadUserProfile(user) {
    try {
        // TODO: Implement actual user profile loading from Firebase
        const userProfile = await firestoreMethods.getUserProfile(user.uid);
        
        if (userProfile.exists()) {
            const userData = userProfile.data();
            updateProfileUI(userData);
        } else {
            // Create default profile if it doesn't exist
            const defaultProfile = {
                firstName: 'New',
                lastName: 'User',
                displayName: 'New User',
                email: user.email,
                bio: 'Welcome to AMIGO!',
                location: '',
                work: '',
                education: '',
                relationship: '',
                website: '',
                profilePicture: '',
                coverPhoto: '',
                createdAt: new Date().toISOString(),
                followers: 0,
                following: 0,
                posts: 0,
                likes: 0
            };
            
            await firestoreMethods.createUserProfile(user.uid, defaultProfile);
            updateProfileUI(defaultProfile);
        }
        
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

function updateProfileUI(userData) {
    // Update profile information
    profileName.textContent = userData.displayName || `${userData.firstName} ${userData.lastName}`;
    profileUsername.textContent = `@${userData.username || userData.email.split('@')[0]}`;
    profileBio.textContent = userData.bio || 'No bio available';
    profileLocation.textContent = userData.location || 'Location not specified';
    
    // Format join date
    const joinDate = new Date(userData.createdAt);
    profileJoinDate.textContent = `Joined ${joinDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
    })}`;
    
    // Update about section
    profileWork.textContent = userData.work || 'Not specified';
    profileEducation.textContent = userData.education || 'Not specified';
    profileRelationship.textContent = userData.relationship || 'Not specified';
    profileWebsite.textContent = userData.website || 'Not specified';
    
    // Update profile picture
    if (userData.profilePicture) {
        profilePicture.src = userData.profilePicture;
    }
    
    // Update stats
    postsCount.textContent = userData.posts || 0;
    followersCount.textContent = formatNumber(userData.followers || 0);
    followingCount.textContent = formatNumber(userData.following || 0);
    likesCount.textContent = formatNumber(userData.likes || 0);
}

// Load user posts
async function loadUserPosts(user) {
    try {
        // TODO: Implement loading user-specific posts
        console.log('Loading posts for user:', user.uid);
        
        // For now, the sample posts in the HTML will be displayed
        
    } catch (error) {
        console.error('Error loading user posts:', error);
    }
}

// Profile action handlers
function handleEditProfile() {
    // TODO: Implement profile editing modal/form
    console.log('Edit profile clicked');
    showInfoMessage('Profile editing feature coming soon!');
}

function handleEditCover() {
    // TODO: Implement cover photo upload
    console.log('Edit cover clicked');
    showInfoMessage('Cover photo upload feature coming soon!');
}

function handleEditProfilePic() {
    // TODO: Implement profile picture upload
    console.log('Edit profile picture clicked');
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // TODO: Implement actual file upload
                console.log('Selected file:', file.name);
                showInfoMessage('Profile picture upload feature coming soon!');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                showErrorMessage('Failed to upload profile picture.');
            }
        }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

function handleShareProfile() {
    // TODO: Implement profile sharing
    console.log('Share profile clicked');
    
    // Copy profile URL to clipboard
    const profileUrl = window.location.href;
    navigator.clipboard.writeText(profileUrl).then(() => {
        showSuccessMessage('Profile URL copied to clipboard!');
    }).catch(() => {
        showErrorMessage('Failed to copy profile URL.');
    });
}

async function handleLogout() {
    try {
        await authMethods.signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error logging out:', error);
        showErrorMessage('Failed to log out. Please try again.');
    }
}

// Tab switching functionality
function switchTab(tabName) {
    // Remove active state from all tabs
    const tabs = [postsTab, photosTab, videosTab];
    const contents = [postsContent, photosContent, videosContent];
    
    tabs.forEach(tab => {
        tab.classList.remove('text-blue-500', 'border-b-2', 'border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        tab.classList.add('text-gray-500', 'dark:text-gray-400');
    });
    
    contents.forEach(content => {
        content.classList.add('hidden');
    });
    
    // Add active state to selected tab
    switch (tabName) {
        case 'posts':
            postsTab.classList.add('text-blue-500', 'border-b-2', 'border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
            postsTab.classList.remove('text-gray-500', 'dark:text-gray-400');
            postsContent.classList.remove('hidden');
            break;
        case 'photos':
            photosTab.classList.add('text-blue-500', 'border-b-2', 'border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
            photosTab.classList.remove('text-gray-500', 'dark:text-gray-400');
            photosContent.classList.remove('hidden');
            break;
        case 'videos':
            videosTab.classList.add('text-blue-500', 'border-b-2', 'border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
            videosTab.classList.remove('text-gray-500', 'dark:text-gray-400');
            videosContent.classList.remove('hidden');
            break;
    }
}

// Utility functions
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
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

