const SCREENS = ["settings", "outline", "game", "ending", "album"];

// Hash-synced screen switcher: reloading the page keeps you on the same
// screen. Deliberately not a full history stack (no pushState) — navigating
// mid-game via the browser back button would be confusing, so we just track
// "current screen" and replace the hash rather than pushing new entries.
export function createRouter({ onChange } = {}) {
  function isValid(name) {
    return SCREENS.includes(name);
  }

  function show(name) {
    const target = isValid(name) ? name : "settings";
    SCREENS.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.toggle("active", s === target);
    });
    const nextHash = `#/${target}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
    if (onChange) onChange(target);
    return target;
  }

  function currentFromHash() {
    const match = window.location.hash.match(/^#\/(\w+)/);
    return match ? match[1] : null;
  }

  window.addEventListener("hashchange", () => {
    const name = currentFromHash();
    if (name && isValid(name)) show(name);
  });

  return { show, currentFromHash, SCREENS };
}
