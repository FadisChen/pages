// 全域變量
        let md;
        let isDarkTheme = false;

        // 初始化 Markdown-it
        md = window.markdownit({
            html: true,
            linkify: true,
            typographer: false,
            highlight: function (str, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    try {
                        return '<pre><code class="hljs language-' + lang + '">' +
                            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                            '</code></pre>';
                    } catch (__) { }
                }
                // 如果沒有指定語言、hljs 未定義或高亮失敗，直接返回原始碼，並用 pre 和 code 包裹
                return '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
            }
        });

        // 初始化 Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose'
        });

        // 預設內容
        const defaultContent = "";

        // 獲取 DOM 元素
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const toggleEditor = document.getElementById('toggleEditor');
        const themeToggle = document.getElementById('themeToggle');
        const clearBtn = document.getElementById('clearBtn');
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const fileInput = document.getElementById('fileInput');

        // 設置預設內容
        editor.value = defaultContent;

        // 更新預覽
        async function updatePreview() {
            const content = editor.value;

            try {
                // 先提取所有 Mermaid 程式碼區塊
                const mermaidBlocks = [];
                let processedContent = content.replace(/```mermaid\n([\s\S]*?)\n```/g, (match, code) => {
                    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                    const cleanCode = code.trim();
                    mermaidBlocks.push({ id, code: cleanCode });
                    return `<div class="mermaid-placeholder" data-id="${id}"></div>`;
                });

                // 渲染 Markdown（不包含 Mermaid 圖表）
                const html = md.render(processedContent);
                preview.innerHTML = html;

                // 渲染 Mermaid 圖表
                const placeholders = preview.querySelectorAll('.mermaid-placeholder');
                for (let i = 0; i < placeholders.length && i < mermaidBlocks.length; i++) {
                    const placeholder = placeholders[i];
                    const block = mermaidBlocks[i];

                    try {
                        // 清理 Mermaid 代碼，移除可能的 HTML 標籤和多餘空白
                        const cleanCode = block.code
                            .replace(/<[^>]*>/g, '') // 移除 HTML 標籤
                            .replace(/&lt;/g, '<')   // 解碼 HTML 實體
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                            .trim();

                        const { svg } = await mermaid.render(block.id, cleanCode);
                        placeholder.outerHTML = `<div class="mermaid" id="${block.id}">${svg}</div>`;
                    } catch (error) {
                        console.error('Mermaid 渲染錯誤:', error);
                        placeholder.outerHTML = `<div class="error-message">
                    <strong>圖表渲染錯誤:</strong><br/>
                    ${error.message}<br/>
                    <details>
                        <summary>查看原始代碼</summary>
                        <pre>${block.code}</pre>
                    </details>
                </div>`;
                    }
                }
            } catch (error) {
                console.error('預覽更新錯誤:', error);
                preview.innerHTML = `<div class="error-message">預覽錯誤: ${error.message}</div>`;
            }
        }

        // 主題切換
        function toggleTheme() {
            isDarkTheme = !isDarkTheme;
            const body = document.body;

            if (isDarkTheme) {
                body.setAttribute('data-theme', 'dark');
                themeToggle.textContent = '☀️ 淺色';

                // 更新 Mermaid 主題
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'loose'
                });
            } else {
                body.removeAttribute('data-theme');
                themeToggle.textContent = '🌙 深色';

                // 重置 Mermaid 主題
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose'
                });
            }

            // 重新渲染預覽
            updatePreview();
        }

        // 清除內容
        function clearContent() {
            if (confirm('確定要清除所有內容嗎？')) {
                editor.value = '';
                updatePreview();
            }
        }

        // 切換編輯器顯示/隱藏
        function toggleEditorVisibility() {
            const container = document.querySelector('.container');
            const editorPanel = document.querySelector('.editor-panel');
            const previewPanel = document.querySelector('.preview-panel');
            const isHidden = container.classList.contains('editor-hidden');

            if (isHidden) {
                // 顯示編輯器
                container.classList.remove('editor-hidden');
                toggleEditor.textContent = '📝 隱藏';

                // 如果之前有拖曳過，恢復之前的比例，否則使用預設 50:50
                if (!editorPanel.style.flex || editorPanel.style.flex === '') {
                    editorPanel.style.flex = '1';
                    previewPanel.style.flex = '1';
                }
            } else {
                // 隱藏編輯器
                container.classList.add('editor-hidden');
                toggleEditor.textContent = '📝 顯示';

                // 重置預覽區為佔滿整個寬度，覆蓋任何之前的 flex 設定
                previewPanel.style.flex = '1';
            }
        }

        // 匯出功能
        function exportContent() {
            const content = editor.value;
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.md';
            a.click();
            URL.revokeObjectURL(url);
        }

        // 面板大小調整
        function initResizer() {
            const resizer = document.getElementById('resizer');
            const editorPanel = document.querySelector('.editor-panel');
            const previewPanel = document.querySelector('.preview-panel');
            const container = document.querySelector('.container');
            let isResizing = false;

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                resizer.classList.add('dragging');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });

            function handleMouseMove(e) {
                if (!isResizing) return;

                const containerRect = container.getBoundingClientRect();
                const containerWidth = containerRect.width;
                const relativeX = e.clientX - containerRect.left;
                const percentage = (relativeX / containerWidth) * 100;

                // 限制拖曳範圍在 20% 到 80% 之間
                if (percentage >= 20 && percentage <= 80) {
                    editorPanel.style.flex = `0 0 ${percentage}%`;
                    previewPanel.style.flex = `0 0 ${100 - percentage}%`;
                }
            }

            function handleMouseUp() {
                isResizing = false;
                resizer.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
        }

        // 動態視窗高度計算
        function setViewportHeight() {
            // 計算實際可用的視窗高度
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }

        // 防抖的視窗高度更新函數
        const debouncedSetViewportHeight = debounce(setViewportHeight, 100);

        // 初始化應用
        function init() {
            // 設置初始視窗高度
            setViewportHeight();

            // 監聽視窗大小變化
            window.addEventListener('resize', debouncedSetViewportHeight);
            window.addEventListener('orientationchange', () => {
                // 延遲執行以確保方向變化完成
                setTimeout(setViewportHeight, 100);
            });

            // 監聽視覺視窗變化（主要針對手機瀏覽器）
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', debouncedSetViewportHeight);
            }

            // 防抖處理 updatePreview
            const debouncedUpdatePreview = debounce(updatePreview, 300); // 300ms 延遲

            // 綁定事件
            editor.addEventListener('input', debouncedUpdatePreview);
            toggleEditor.addEventListener('click', toggleEditorVisibility);
            themeToggle.addEventListener('click', toggleTheme);
            clearBtn.addEventListener('click', clearContent);
            exportBtn.addEventListener('click', exportContent);
            importBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        editor.value = e.target.result;
                        updatePreview(); // Assuming updatePreview() is the function that refreshes the preview
                    };
                    reader.readAsText(file);
                    // Reset file input value to allow importing the same file again
                    event.target.value = null;
                }
            });

            // 初始化調整器
            initResizer();

            // 手動觸發 highlight.js (如果可用)
            if (typeof hljs !== 'undefined') {
                hljs.highlightAll();
            }

            // 初始渲染
            updatePreview();
        }

        // 頁面載入完成後初始化
        document.addEventListener('DOMContentLoaded', init);

        // 防抖函數
        function debounce(func, delay) {
            let timeout;
            return function (...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        }

        // 匯出到全域作用域以便調試
        window.DocViewer = {
            md,
            mermaid,
            toggleTheme,
            toggleEditorVisibility,
            clearContent,
            exportContent,
            updatePreview,
            setViewportHeight
        };

        // 模態視窗相關功能
        document.addEventListener('DOMContentLoaded', function () {
            const modal = document.getElementById('diagramModal');
            const modalDiagram = document.getElementById('modalDiagram');
            const closeBtn = document.getElementById('closeModal');
            const downloadBtn = document.getElementById('downloadPng');
            const previewContainer = document.querySelector('.preview-container');
            let currentScale = 1;
            let currentDiagram = null;
            let initialDistance = 0;
            let lastX = 0;
            let lastY = 0;
            let isPanning = false;
            let currentX = 0;
            let currentY = 0;

            // 點擊預覽區域中的 mermaid 圖表時打開模態視窗
            previewContainer.addEventListener('click', function (e) {
                if (e.target.closest('.mermaid')) {
                    const diagram = e.target.closest('.mermaid');
                    currentDiagram = diagram.cloneNode(true);
                    modalDiagram.innerHTML = '';
                    modalDiagram.appendChild(currentDiagram);
                    modal.style.display = 'block';
                    currentScale = 1.5;
                    currentX = 0;
                    currentY = 0;
                    lastX = 0;
                    lastY = 0;
                    // 將 updateTransform 呼叫移到 requestAnimationFrame 中
                    if (!rafId) {
                        rafId = requestAnimationFrame(updateTransformInRAF);
                    }
                }
            });

            // 關閉模態視窗
            closeBtn.onclick = function () {
                modal.style.display = 'none';
            }

            // 點擊模態視窗外部時關閉
            window.onclick = function (e) {
                if (e.target == modal) {
                    modal.style.display = 'none';
                }
            }

            // 滑鼠滾輪縮放
            modalDiagram.addEventListener('wheel', function (e) {
                e.preventDefault();
                const delta = e.deltaY;
                const scaleChange = 1 - delta * 0.003;
                const newScale = currentScale * scaleChange;

                // 限制縮放範圍
                if (newScale >= 0.1 && newScale <= 10) {
                    currentScale = newScale;
                    if (!rafId) {
                        rafId = requestAnimationFrame(updateTransformInRAF);
                    }
                }
            });

            // 觸控縮放和平移
            modalDiagram.addEventListener('touchstart', function (e) {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    initialDistance = getTouchDistance(e.touches);
                } else if (e.touches.length === 1) {
                    isPanning = true;
                    lastX = e.touches[0].clientX;
                    lastY = e.touches[0].clientY;

                    // Get current transform for smooth start
                    if (currentDiagram) {
                        const { x, y } = getTranslateValues(currentDiagram);
                        currentX = x;
                        currentY = y;
                    }
                }
            });

            // 滑鼠拖曱功能
            modalDiagram.addEventListener('mousedown', function (e) {
                if (e.button === 0) { // 只處理左鍵點擊
                    e.preventDefault();
                    isPanning = true;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    modalDiagram.classList.add('grabbing');

                    // Get current transform for smooth start
                    if (currentDiagram) {
                        const { x, y } = getTranslateValues(currentDiagram);
                        currentX = x;
                        currentY = y;
                    }
                }
            }); document.addEventListener('mousemove', function (e) {
                if (isPanning) {
                    e.preventDefault();
                    const deltaX = (e.clientX - lastX);
                    const deltaY = (e.clientY - lastY);
                    lastX = e.clientX;
                    lastY = e.clientY;

                    currentX += deltaX;
                    currentY += deltaY;

                    // 將 updateTransform 呼叫移到 requestAnimationFrame 中
                    if (!rafId) {
                        rafId = requestAnimationFrame(updateTransformInRAF);
                    }
                }
            });

            document.addEventListener('mouseup', function () {
                if (isPanning) {
                    isPanning = false;
                    modalDiagram.classList.remove('grabbing');
                    // 清除任何待處理的 requestAnimationFrame
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                    }
                }
            });

            modalDiagram.addEventListener('touchmove', function (e) {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentDistance = getTouchDistance(e.touches);
                    const scale = currentDistance / initialDistance;

                    const newScale = currentScale * scale;
                    if (newScale >= 0.1 && newScale <= 10) {
                        currentScale = newScale;
                        initialDistance = currentDistance;
                        // 將 updateTransform 呼叫移到 requestAnimationFrame 中
                        if (!rafId) {
                            rafId = requestAnimationFrame(updateTransformInRAF);
                        }
                    }
                } else if (e.touches.length === 1 && isPanning) {
                    e.preventDefault();
                    const deltaX = (e.touches[0].clientX - lastX);
                    const deltaY = (e.touches[0].clientY - lastY);
                    lastX = e.touches[0].clientX;
                    lastY = e.touches[0].clientY;

                    currentX += deltaX;
                    currentY += deltaY;

                    // 將 updateTransform 呼叫移到 requestAnimationFrame 中
                    if (!rafId) {
                        rafId = requestAnimationFrame(updateTransformInRAF);
                    }
                }
            });

            // 計算兩個觸控點之間的距離
            function getTouchDistance(touches) {
                const dx = touches[1].clientX - touches[0].clientX;
                const dy = touches[1].clientY - touches[0].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }

            let rafId = null; // 新增用於追蹤 requestAnimationFrame 的 ID

            // 更新變形函式 (在 requestAnimationFrame 中呼叫)
            function updateTransformInRAF() {
                if (currentDiagram) {
                    currentDiagram.style.transform = `translate(${Math.round(currentX)}px, ${Math.round(currentY)}px) scale(${currentScale})`;
                }
                rafId = null; // 重置 rafId
            }

            // 更新變形函式 (原始的，現在被 updateTransformInRAF 取代，但保留以防萬一)
            function updateTransform() {
                if (currentDiagram) {
                    currentDiagram.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
                }
            }

            // 下載 PNG 功能            
            downloadBtn.onclick = async function () {
                if (currentDiagram) {
                    try {
                        const svgElement = currentDiagram.querySelector('svg');
                        if (!svgElement) return;

                        // 取得原始 SVG 的尺寸
                        const bbox = svgElement.getBBox();
                        const viewBox = svgElement.viewBox.baseVal;

                        // 建立高解析度尺寸 (4倍原始大小)
                        const scale = 4;
                        const width = Math.max(bbox.width, viewBox.width) * scale;
                        const height = Math.max(bbox.height, viewBox.height) * scale;

                        // 複製並調整 SVG
                        const clonedSvg = svgElement.cloneNode(true);
                        clonedSvg.setAttribute('width', width);
                        clonedSvg.setAttribute('height', height);

                        const svgData = new XMLSerializer().serializeToString(clonedSvg);
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        // 建立圖片
                        const img = new Image();
                        img.onload = function () {
                            // 設定 canvas 為高解析度尺寸
                            canvas.width = width;
                            canvas.height = height;

                            // 繪製前先進行平滑處理
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';

                            // 使用白色背景（避免透明）
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            // 繪製圖片
                            ctx.drawImage(img, 0, 0, width, height);

                            // 下載高品質 PNG
                            const link = document.createElement('a');
                            link.download = 'diagram-high-res.png';
                            link.href = canvas.toDataURL('image/png', 1.0); // 使用最高品質
                            link.click();
                        };

                        // 將 SVG 轉換為 base64
                        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    } catch (error) {
                        console.error('下載 PNG 時發生錯誤:', error);
                    }
                }
            }
        });