const THEME_STORAGE_KEY = "memorytraveler.ui-theme.v1";

const THEME_LABELS = Object.freeze({
  dawn: "曙光手帳",
  midnight: "午夜檔案",
  field: "野地剪貼簿"
});

const THEME_NAMES = Object.freeze(Object.keys(THEME_LABELS));

export function initThemeSwitcher() {
  const options = [...document.querySelectorAll("[data-theme-choice]")];
  const activeStyleName = document.getElementById("activeStyleName");
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  function applyTheme(themeName) {
    const nextTheme = THEME_NAMES.includes(themeName) ? themeName : "dawn";
    document.body.dataset.theme = nextTheme;

    options.forEach((option) => {
      const selected = option.dataset.themeChoice === nextTheme;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });

    if (activeStyleName) activeStyleName.textContent = THEME_LABELS[nextTheme];
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  options.forEach((option) => {
    option.addEventListener("click", () => applyTheme(option.dataset.themeChoice));
  });

  applyTheme(savedTheme || "dawn");
}
