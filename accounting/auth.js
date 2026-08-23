(function () {
  'use strict';

  const AUTH_STORAGE_KEY = 'accounting-auth-v1';
  const AUTH_STORAGE_VALUE = 'authenticated';
  const EXPECTED_USERNAME = 'fadis';
  const EXPECTED_PASSWORD = '1128';

  let resolveAuthReady;
  const authReady = new Promise(function (resolve) {
    resolveAuthReady = resolve;
  });

  function readAuthState() {
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) === AUTH_STORAGE_VALUE;
    } catch (error) {
      return false;
    }
  }

  function writeAuthState() {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, AUTH_STORAGE_VALUE);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isValidCredentials(username, password) {
    return username === EXPECTED_USERNAME && password === EXPECTED_PASSWORD;
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
            setError('無法保存登入狀態，請確認瀏覽器允許本機儲存。');
          } else {
            unlock();
          }
        } else {
          setError('帳號或密碼不正確。');
        }
      } catch (error) {
        setError('登入驗證失敗，請重新嘗試。');
      } finally {
        if (document.documentElement.classList.contains('auth-locked')) {
          usernameInput.disabled = false;
          passwordInput.disabled = false;
          submitButton.disabled = false;
          submitButton.textContent = '登入記帳本 ↗';
          passwordInput.focus();
        }
      }
    });

    [usernameInput, passwordInput].forEach(function (input) {
      input.addEventListener('input', function () { setError(''); });
    });
  }

  window.AccountingAuth = {
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
