
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const postsRef = collection(db, "posts");

// Handle new post submission (post button or form)
async function handleCreatePost() {
  const content = postInput.value.trim();
  if (!content) {
    showErrorMessage('Please enter some content for your post.');
    return;
  }

  try {
    postBtn.textContent = 'Posting...';
    postBtn.disabled = true;

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

    await addDoc(postsRef, postData);
    postInput.value = '';
    showSuccessMessage('Post created successfully!');
  } catch (error) {
    console.error('Error creating post:', error);
    showErrorMessage('Failed to create post.');
  } finally {
    postBtn.textContent = 'Post';
    postBtn.disabled = false;
  }
}

// Load real-time posts from Firestore
async function loadPosts() {
  try {
    const q = query(postsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const posts = [];
      snapshot.forEach((doc) => {
        posts.push({ id: doc.id, ...doc.data() });
      });
      renderPosts(posts);
    });

    window.unsubscribePosts = unsubscribe;
  } catch (error) {
    console.error('Error loading posts:', error);
    showErrorMessage('Failed to load posts.');
  }
}

// Render all posts
function renderPosts(posts) {
  postsFeed.innerHTML = ''; // ✅ Clear feed before rendering

  posts.forEach(post => {
    const postElement = createPostElement(post);
    postsFeed.appendChild(postElement);
  });
}

// Render individual post
function createPostElement(post) {
  const postDiv = document.createElement('div');
  postDiv.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden';
  postDiv.innerHTML = `
    <div class="p-6">
      <div class="flex items-center mb-4">
        <div class="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 overflow-hidden">
          <img src="${post.authorPhoto || 'images/default-profile.jpg'}" alt="${post.authorName}" class="w-full h-full object-cover">
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
          <button class="flex items-center text-gray-500 hover:text-red-500">
            <i class="far fa-heart mr-2"></i><span>${post.likes || 0}</span>
          </button>
          <button class="flex items-center text-gray-500 hover:text-blue-500">
            <i class="far fa-comment mr-2"></i><span>${post.comments || 0}</span>
          </button>
          <button class="flex items-center text-gray-500 hover:text-green-500">
            <i class="fas fa-share mr-2"></i><span>Share</span>
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
