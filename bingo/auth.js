(function () {
  'use strict';

  const AUTH_STORAGE_KEY = 't-dept-bingo-auth-v1';
  const AUTH_STORAGE_VALUE = 'authenticated';
  const EXPECTED_USERNAME_HASH = '3d164c28fb557dd83f9d6207f989b17adb818cf367711bcfc341b854428695b3';
  const EXPECTED_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

  let resolveAuthReady;
  const authReady = new Promise(function (resolve) {
    resolveAuthReady = resolve;
  });

  function readAuthState() {
    try {
      return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === AUTH_STORAGE_VALUE;
    } catch (error) {
      return false;
    }
  }

  function writeAuthState() {
    try {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, AUTH_STORAGE_VALUE);
      return true;
    } catch (error) {
      return false;
    }
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  async function sha256(value) {
    if (!window.crypto || !window.crypto.subtle || typeof window.TextEncoder !== 'function') {
      throw new Error('WEB_CRYPTO_UNAVAILABLE');
    }

    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return toHex(digest);
  }

  async function isValidCredentials(username, password) {
    const hashes = await Promise.all([sha256(username), sha256(password)]);
    return hashes[0] === EXPECTED_USERNAME_HASH && hashes[1] === EXPECTED_PASSWORD_HASH;
  }

  function unlock() {
    document.documentElement.classList.remove('auth-locked');
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.hidden = true;
    resolveAuthReady();
  }

  function setError(message) {
    const error = document.getElementById('authError');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function initAuth() {
    if (readAuthState()) {
      unlock();
      return;
    }

    const overlay = document.getElementById('authOverlay');
    const form = document.getElementById('authForm');
    const usernameInput = document.getElementById('authUsername');
    const passwordInput = document.getElementById('authPassword');
    const submitButton = document.getElementById('authSubmit');

    if (!overlay || !form || !usernameInput || !passwordInput || !submitButton) {
      setError('登入視窗載入失敗，請重新整理頁面。');
      return;
    }

    overlay.hidden = false;
    window.setTimeout(function () { usernameInput.focus(); }, 0);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setError('');

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) {
        setError('請輸入帳號與密碼。');
        return;
      }

      usernameInput.disabled = true;
      passwordInput.disabled = true;
      submitButton.disabled = true;
      submitButton.textContent = '驗證中…';

      try {
        if (await isValidCredentials(username, password)) {
          if (!writeAuthState()) {
            setError('無法保存登入狀態，請確認瀏覽器允許工作階段儲存。');
          } else {
            unlock();
          }
        } else {
          setError('帳號或密碼不正確。');
        }
      } catch (error) {
        setError(error.message === 'WEB_CRYPTO_UNAVAILABLE'
          ? '目前瀏覽器不支援安全雜湊，請改用較新的瀏覽器。'
          : '登入驗證失敗，請重新嘗試。');
      } finally {
        if (document.documentElement.classList.contains('auth-locked')) {
          usernameInput.disabled = false;
          passwordInput.disabled = false;
          submitButton.disabled = false;
          submitButton.textContent = '登入主控台 ↗';
          passwordInput.focus();
        }
      }
    });

    [usernameInput, passwordInput].forEach(function (input) {
      input.addEventListener('input', function () { setError(''); });
    });
  }

  window.BingoAuth = {
    ready: authReady,
    isAuthenticated: readAuthState
  };

  if (!readAuthState()) {
    document.documentElement.classList.add('auth-locked');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
}());
