const ThemeManager = {
  STORAGE_KEY: "directory_theme",

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY) || "dark";
    this.setTheme(saved);

    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        this.setTheme(current === "dark" ? "light" : "dark");
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
    
    const moonIcon = document.getElementById("moonIcon");
    const sunIcon = document.getElementById("sunIcon");
    if (moonIcon && sunIcon) {
      if (theme === "dark") {
        moonIcon.style.display = "block";
        sunIcon.style.display = "none";
      } else {
        moonIcon.style.display = "none";
        sunIcon.style.display = "block";
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  ThemeManager.init();
});
