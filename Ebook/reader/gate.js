/* 密碼閘：未通過前隱藏頁面內容；通過後記在 localStorage，之後不再詢問。
   用法：<head> 內載入本檔；需要等解鎖才執行的程式包在 Gate.then(fn) 裡。 */
(function () {
  var KEY = 'ebook-auth';
  var PASS_HASH = '0d6c4cbd4873f28db64f9c4f0dd13bfd7a75cc0092a1cc00eeda9214083e59e7'; // SHA-256
  var root = document.documentElement;
  var queue = [];
  var ok = false;
  try { ok = localStorage.getItem(KEY) === '1'; } catch (e) {}

  window.Gate = {
    then: function (fn) { ok ? fn() : queue.push(fn); }
  };
  if (ok) return;

  root.classList.add('lock');
  var style = document.createElement('style');
  style.textContent =
    '.lock body>*:not(#gate){display:none!important}' +
    '#gate{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:9999}' +
    '#gate form{background:#fff;color:#222;padding:24px;border-radius:12px;width:min(300px,calc(100vw - 32px));text-align:center;font-family:inherit}' +
    '#gate input{width:100%;box-sizing:border-box;margin:12px 0;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:8px}' +
    '#gate button{width:100%;padding:10px;font-size:16px;border:0;border-radius:8px;background:#1C3A2E;color:#fff}' +
    '#gate p{margin:0;color:#c0392b;min-height:1.2em;font-size:14px}';
  document.head.appendChild(style);

  async function sha256(s) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var gate = document.createElement('div');
    gate.id = 'gate';
    gate.innerHTML =
      '<form><b>請輸入密碼</b>' +
      '<input type="password" autocomplete="off">' +
      '<p></p><button type="submit">進入</button></form>';
    document.body.appendChild(gate);
    var form = gate.firstChild;
    var input = form.querySelector('input');
    input.focus();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (await sha256(input.value) === PASS_HASH) {
        try { localStorage.setItem(KEY, '1'); } catch (err) {}
        gate.remove();
        style.remove();
        root.classList.remove('lock');
        queue.splice(0).forEach(function (fn) { fn(); });
      } else {
        form.querySelector('p').textContent = '密碼錯誤';
        input.value = '';
        input.focus();
      }
    });
  });
})();
