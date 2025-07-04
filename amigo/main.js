document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element Selectors ---
    const showLoginBtn = document.getElementById('showLogin');
    const showSignupBtn = document.getElementById('showSignup');
    const loginContainer = document.getElementById('loginContainer');
    const signupContainer = document.getElementById('signupContainer');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const moonIcon = document.getElementById('moonIcon');
    const sunIcon = document.getElementById('sunIcon');
    const passwordToggles = document.querySelectorAll('.password-toggle');
    
    // --- Icon SVGs ---
    const eyeIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>`;
    const eyeOffIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064-7 9.542-7 .847 0 1.67.111 2.454.316M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 2.292V12c0-1.141-.243-2.24-.68-3.228M21 12a9.999 9.999 0 00-1.085-4.223M3 3l18 18" />
        </svg>`;

    // --- Form Toggling ---
    const showLogin = () => {
        signupContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    };

    const showSignup = () => {
        loginContainer.classList.add('hidden');
        signupContainer.classList.remove('hidden');
    };

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });
    
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showSignup();
    });
    
    // --- Dark Mode ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            moonIcon.classList.add('hidden');
            sunIcon.classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            moonIcon.classList.remove('hidden');
            sunIcon.classList.add('hidden');
        }
    };
    
    // Check for saved theme in localStorage
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme(prefersDark ? 'dark' : 'light');
    }
    
    darkModeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    // --- Password Visibility ---
    passwordToggles.forEach(toggle => {
        // Initialize with the eye icon
        toggle.innerHTML = eyeIconSVG;

        toggle.addEventListener('click', () => {
            const targetInputId = toggle.getAttribute('data-target');
            const passwordInput = document.getElementById(targetInputId);
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggle.innerHTML = eyeOffIconSVG;
            } else {
                passwordInput.type = 'password';
                toggle.innerHTML = eyeIconSVG;
            }
        });
    });

    // --- Form Validation ---
    const validateForm = (form, errorElement) => {
        errorElement.textContent = '';
        errorElement.classList.add('hidden');

        let isValid = true;
        const inputs = form.querySelectorAll('input[required]');

        inputs.forEach(input => {
            // Reset border color
            input.classList.remove('border-red-500', 'focus:ring-red-500');
            input.classList.add('border-gray-300', 'focus:ring-indigo-500');

            if (!input.value.trim()) {
                isValid = false;
                errorElement.textContent = 'Please fill out all required fields.';
                input.classList.add('border-red-500', 'focus:ring-red-500');
                input.classList.remove('border-gray-300', 'focus:ring-indigo-500');
            } else if (input.type === 'email' && !/^\S+@\S+\.\S+$/.test(input.value)) {
                 isValid = false;
                 errorElement.textContent = 'Please enter a valid email address.';
                 input.classList.add('border-red-500', 'focus:ring-red-500');
                 input.classList.remove('border-gray-300', 'focus:ring-indigo-500');
            }
        });

        if (!isValid) {
            errorElement.classList.remove('hidden');
        }

        return isValid;
    };
  })();