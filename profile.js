const toggle = document.getElementById("darkModeToggle");
const moon = document.getElementById("moonIcon");
const sun = document.getElementById("sunIcon");

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    moon?.classList.add("hidden");
    sun?.classList.remove("hidden");
  } else {
    root.classList.remove("dark");
    moon?.classList.remove("hidden");
    sun?.classList.add("hidden");
  }
}

const savedTheme = localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyTheme(savedTheme);

toggle?.addEventListener("click", () => {
  const newTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme);
});
