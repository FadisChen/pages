(() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const STORAGE_KEY = 'y2bsummary_settings';
  const DEFAULT_MODEL = 'gemini-3-flash-preview';
  const DEFAULT_PROMPT =
    '請提供：\n1. 影片主要內容筆記\n2. 關鍵觀點和重要資訊\n3. 主要結論或要點\n4. 如果有教學內容，請列出主要步驟\n\n請用繁體中文回答，並保持內容簡潔明瞭。';

  /** 心智圖專用：與 ChatExtension/sidebar.js generateMindmapMarkdown 相同規則（不依設定裡的摘要 prompt） */
  const MINDMAP_CONTENT_MAX = 5000;

  function buildMindmapPrompt(articleContent) {
    const truncated =
      articleContent.length > MINDMAP_CONTENT_MAX
        ? `${articleContent.substring(0, MINDMAP_CONTENT_MAX)}...`
        : articleContent;
    return `請將以下文章內容分析後，轉換成心智圖格式的 Markdown。規則：
1. 第一行用 # 標題作為心智圖的中心主題
2. 用 ## 表示主要分支（3到6個）
3. 用 ### 表示次要分支
4. 在各層級下用 - 列出關鍵要點
5. 每個要點保持簡潔（不超過15個字）
6. 層級不超過 5 層
7. 只需輸出 Markdown，不要任何說明文字或程式碼區塊標記

文章內容：
${truncated}`;
  }

  function stripMarkdownCodeFence(raw) {
    return raw
      .replace(/^```(?:markdown)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
  }

  function extractGeminiText(result) {
    if (!result?.candidates?.length) return '';
    for (const cand of result.candidates) {
      const parts = cand?.content?.parts || [];
      for (const p of parts) {
        if (typeof p.text === 'string' && p.text.trim()) return p.text;
      }
    }
    return '';
  }

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const videoUrlInput   = document.getElementById('video-url');
  const submitBtn       = document.getElementById('submit-btn');
  const settingsBtn     = document.getElementById('settings-btn');
  const modalOverlay    = document.getElementById('modal-overlay');
  const modalClose      = document.getElementById('modal-close');
  const modalCancel     = document.getElementById('modal-cancel');
  const modalSave       = document.getElementById('modal-save');
  const apiKeyInput     = document.getElementById('api-key');
  const modelNameInput  = document.getElementById('model-name');
  const promptInput     = document.getElementById('prompt-input');
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultLoading   = document.getElementById('result-loading');
  const resultError     = document.getElementById('result-error');
  const resultErrorMsg  = document.getElementById('result-error-msg');
  const resultContent   = document.getElementById('result-content');
  const toast           = document.getElementById('toast');

  // ── Tab refs ───────────────────────────────────────────────────────────────
  const tabNote       = document.getElementById('tab-note');
  const tabMindmap    = document.getElementById('tab-mindmap');
  const panelNote     = document.getElementById('panel-note');
  const panelMindmap  = document.getElementById('panel-mindmap');

  // ── Mindmap refs ───────────────────────────────────────────────────────────
  const mindmapWrap        = document.getElementById('mindmap-wrap');
  const mindmapSvg         = document.getElementById('mindmap-svg');
  const mindmapPlaceholder = document.getElementById('mindmap-placeholder');
  const mmZoomIn    = document.getElementById('mm-zoom-in');
  const mmZoomOut   = document.getElementById('mm-zoom-out');
  const mmFit       = document.getElementById('mm-fit');
  const mmExpand    = document.getElementById('mm-expand');
  const mmCollapse  = document.getElementById('mm-collapse');

  // ── Settings ───────────────────────────────────────────────────────────────
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveSettings(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function populateModal() {
    const s = loadSettings();
    apiKeyInput.value    = s.apiKey    || '';
    modelNameInput.value = s.modelName || DEFAULT_MODEL;
    promptInput.value    = s.prompt    || DEFAULT_PROMPT;
  }

  function persistModal() {
    const s = loadSettings();
    s.apiKey    = apiKeyInput.value.trim();
    s.modelName = modelNameInput.value.trim() || DEFAULT_MODEL;
    s.prompt    = promptInput.value.trim()    || DEFAULT_PROMPT;
    saveSettings(s);
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openModal() {
    populateModal();
    modalOverlay.classList.add('is-open');
    // Focus first input for accessibility
    setTimeout(() => apiKeyInput.focus(), 50);
  }

  function closeModal() {
    modalOverlay.classList.remove('is-open');
    settingsBtn.focus();
  }

  settingsBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);

  modalSave.addEventListener('click', () => {
    persistModal();
    closeModal();
    showToast('設定已儲存');
  });

  // Close on overlay click (outside modal box)
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('is-open')) {
      closeModal();
    }
  });

  // ── Tab switching ─────────────────────────────────────────────────────────
  function activateTab(tab) {
    const isNote = tab === 'note';
    tabNote.classList.toggle('is-active', isNote);
    tabNote.setAttribute('aria-selected', String(isNote));
    tabMindmap.classList.toggle('is-active', !isNote);
    tabMindmap.setAttribute('aria-selected', String(!isNote));
    panelNote.classList.toggle('is-active', isNote);
    panelMindmap.classList.toggle('is-active', !isNote);

    // 分頁剛顯示時容器尺寸才正確，延遲 fit 避免在 display:none 下建立導致空白
    if (!isNote && markmapInstance) {
      requestAnimationFrame(() => {
        markmapInstance.fit();
        requestAnimationFrame(() => markmapInstance.fit());
      });
    }
  }

  tabNote.addEventListener('click', () => activateTab('note'));
  tabMindmap.addEventListener('click', () => activateTab('mindmap'));

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer = null;

  function showToast(message, duration = 2200) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  // ── Markmap（與 ChatExtension/sidebar.js 相同模式：destroy → 清空 SVG → Markmap.create）──
  let markmapInstance = null;

  function mindmapWalkTree(node, callback) {
    if (!node) return;
    callback(node);
    if (node.children) {
      node.children.forEach((child) => mindmapWalkTree(child, callback));
    }
  }

  function fitMindmapSoon() {
    if (!markmapInstance) return;
    requestAnimationFrame(() => {
      markmapInstance.fit();
      requestAnimationFrame(() => markmapInstance.fit());
    });
  }

  /** 心智圖在「摘要筆記」分頁時可能處於 display:none，尺寸為 0；用 ResizeObserver 在可見後重算版面 */
  if (typeof ResizeObserver !== 'undefined' && mindmapWrap) {
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e || !markmapInstance) return;
      const { width, height } = e.contentRect;
      if (width > 1 && height > 1) markmapInstance.fit();
    });
    ro.observe(mindmapWrap);
  }

  function renderMindmap(markdownText) {
    const mm = window.markmap;
    if (!mm || !mm.Transformer || !mm.Markmap) {
      console.warn('markmap 未載入（請確認 js/d3、markmap-lib、markmap-view 順序正確）');
      return;
    }

    const { Transformer, Markmap } = mm;

    try {
      const transformer = new Transformer();
      const { root } = transformer.transform(markdownText);

      mindmapPlaceholder.style.display = 'none';
      mindmapSvg.classList.add('is-visible');

      if (markmapInstance) {
        markmapInstance.destroy();
        markmapInstance = null;
      }
      mindmapSvg.innerHTML = '';

      markmapInstance = Markmap.create(
        mindmapSvg,
        {
          autoFit: true,
          duration: 300,
        },
        root
      );

      fitMindmapSoon();
    } catch (err) {
      console.error('心智圖渲染失敗', err);
    }
  }

  // Toolbar button handlers
  mmZoomIn.addEventListener('click', () => {
    if (!markmapInstance) return;
    markmapInstance.rescale(1.25);
  });

  mmZoomOut.addEventListener('click', () => {
    if (!markmapInstance) return;
    markmapInstance.rescale(0.8);
  });

  mmFit.addEventListener('click', () => {
    if (!markmapInstance) return;
    markmapInstance.fit();
  });

  mmExpand.addEventListener('click', () => {
    if (!markmapInstance) return;
    mindmapWalkTree(markmapInstance.state.data, (node) => {
      if (node.payload) node.payload.fold = 0;
      else node.payload = { fold: 0 };
    });
    markmapInstance.setData();
    markmapInstance.fit();
  });

  mmCollapse.addEventListener('click', () => {
    if (!markmapInstance) return;
    const root = markmapInstance.state.data;
    if (root && root.children) {
      root.children.forEach((child) => {
        mindmapWalkTree(child, (node) => {
          if (node.payload) node.payload.fold = 1;
          else node.payload = { fold: 1 };
        });
      });
    }
    markmapInstance.setData();
    markmapInstance.fit();
  });

  // ── Result display helpers ─────────────────────────────────────────────────
  function showState(state) {
    resultPlaceholder.style.display = state === 'placeholder' ? '' : 'none';
    resultLoading.style.display     = state === 'loading'     ? '' : 'none';
    resultError.style.display       = state === 'error'       ? '' : 'none';
    resultContent.style.display     = state === 'content'     ? '' : 'none';
  }

  function showError(message) {
    resultErrorMsg.textContent = message;
    showState('error');
  }

  // ── Markdown → HTML ────────────────────────────────────────────────────────
  function markdownToHtml(md) {
    if (!md || typeof md !== 'string') return '';

    // Escape HTML entities first to prevent XSS
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Fenced code blocks (must run before inline code)
    html = html.replace(/```[\s\S]*?```/g, (match) => {
      const inner = match.slice(3, -3).replace(/^\n/, '');
      return `<pre><code>${inner}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Headings
    html = html
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1>$1</h1>');

    // Bold / italic
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>');

    // Lists — collect consecutive list items into <ul>
    html = html.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split('\n')
        .map(line => `<li>${line.replace(/^[-*] /, '')}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split('\n')
        .map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`)
        .join('');
      return `<ol>${items}</ol>`;
    });

    // Paragraphs — wrap non-tag lines
    html = html
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (/^<(h[1-3]|ul|ol|li|pre|\/ul|\/ol|\/pre)/.test(trimmed)) return trimmed;
        return `<p>${trimmed}</p>`;
      })
      .join('\n');

    return html;
  }

  /**
   * 第二次 API：僅文字，將摘要轉成適合 markmap 的階層 Markdown（與 ChatExtension 一致）
   */
  async function generateMindmapMarkdown(apiKey, model, summaryText) {
    const apiUrl = `${GEMINI_API_BASE}${encodeURIComponent(model)}:generateContent`;
    const requestBody = {
      contents: [{ parts: [{ text: buildMindmapPrompt(summaryText) }] }],
      generationConfig: {
        temperature: 0.3,
        topK: 1,
        topP: 1,
      },
      systemInstruction: {
        role: 'system',
        parts: [{ text: '請以繁體中文回覆。' }],
      },
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let msg = '';
      try {
        const errBody = await response.json();
        msg = errBody?.error?.message || '';
      } catch {
        /* ignore */
      }
      throw new Error(msg || `心智圖轉換請求失敗（${response.status}）`);
    }

    const result = await response.json();
    const raw = extractGeminiText(result);
    if (!raw.trim()) throw new Error('心智圖 API 未回傳有效文字');
    return stripMarkdownCodeFence(raw);
  }

  // ── API call ───────────────────────────────────────────────────────────────
  async function analyzeVideo(url) {
    const s = loadSettings();

    if (!s.apiKey) {
      showError('尚未設定 API 金鑰，請點擊右上角「設定」按鈕填入。');
      return;
    }

    const model  = s.modelName || DEFAULT_MODEL;
    const prompt = s.prompt    || DEFAULT_PROMPT;
    const apiUrl = `${GEMINI_API_BASE}${encodeURIComponent(model)}:generateContent`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              file_data: { file_uri: url }
            },
            { text: prompt }
          ]
        }
      ],
      systemInstruction: {
        role: 'system',
        parts: [{ text: '請以繁體中文回覆。' }]
      }
    };

    showState('loading');
    submitBtn.disabled = true;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': s.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorBody = {};
        try { errorBody = await response.json(); } catch { /* ignore */ }
        const msg = errorBody?.error?.message || '未知錯誤';
        throw new Error(`API 請求失敗（狀態碼 ${response.status}）：${msg}`);
      }

      const result = await response.json();
      const text = extractGeminiText(result);

      if (!text) {
        throw new Error('API 回應中找不到有效的文字內容，請確認影片網址是否正確。');
      }

      resultContent.innerHTML = markdownToHtml(text);
      showState('content');

      // 心智圖：專用第二段請求（與 ChatExtension 相同邏輯），不依「摘要 Prompt」
      try {
        const mindmapMd = await generateMindmapMarkdown(s.apiKey, model, text);
        renderMindmap(mindmapMd);
      } catch (mmErr) {
        console.warn('心智圖 Markdown 轉換失敗，改以摘要原文顯示：', mmErr);
        showToast('心智圖轉換失敗，已暫以摘要文字繪製心智圖');
        renderMindmap(text);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();

    if (!url) {
      showError('請輸入 YouTube 影片網址。');
      videoUrlInput.focus();
      return;
    }

    if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
      showError('請輸入有效的 YouTube 影片網址（需包含 youtube.com/watch 或 youtu.be）。');
      videoUrlInput.focus();
      return;
    }

    analyzeVideo(url);
  });

  // Allow pressing Enter in URL input to submit
  videoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  showState('placeholder');
})();
