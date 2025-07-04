document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element Selectors ---
    const darkModeToggle = document.getElementById('darkModeToggle');
    const moonIcon = document.getElementById('moonIcon');
    const sunIcon = document.getElementById('sunIcon');
    
    // --- Dark Mode ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            if (moonIcon && sunIcon) {
                moonIcon.classList.add('hidden');
                sunIcon.classList.remove('hidden');
            }
        } else {
            document.documentElement.classList.remove('dark');
            if (moonIcon && sunIcon) {
                moonIcon.classList.remove('hidden');
                sunIcon.classList.add('hidden');
            }
        }
    };

})();
