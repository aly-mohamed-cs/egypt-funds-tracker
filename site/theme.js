"use strict";

(() => {
  const root = document.documentElement;
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const toggle = document.querySelector("#theme-switch");
  const isDark = () => (root.dataset.theme || (systemDark.matches ? "dark" : "light")) === "dark";

  function announce() {
    toggle.setAttribute("aria-checked", String(isDark()));
    window.dispatchEvent(new Event("themechange"));
  }

  toggle.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try {
      localStorage.setItem("egypt-funds:theme", root.dataset.theme);
    } catch {
      // Storage is blocked (e.g. private mode); the choice lasts until the page closes.
    }
    announce();
  });
  systemDark.addEventListener("change", () => {
    if (!root.dataset.theme) announce();
  });
  toggle.setAttribute("aria-checked", String(isDark()));
})();
