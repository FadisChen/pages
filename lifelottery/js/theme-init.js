// Runs before first paint: applies a manually chosen theme so there is no flash of the wrong colours.
// ('system' = no data-theme attribute; the CSS then follows prefers-color-scheme.)
(function () {
  try {
    var t = localStorage.getItem('lifelottery.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
