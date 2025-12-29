// 全域變數
let currentMonth = new Date();
let expenseChart = null;

// 配置 - 請更新您的 GAS Web App URL
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxly3rDUSbmq5HItUueJXd5q2cMqxzQhSurRUpfuaPu3Y4EYkgk6bIwMwwWiwfahxJURQ/exec'; // 請替換為您的 GAS Web App URL

// 是否使用 GET 方式 (避免 CORS 問題)

// DOM 元素
const elements = {
    currentMonthEl: document.getElementById('currentMonth'),
    monthlyTotalEl: document.getElementById('monthlyTotal'),
    expenseListEl: document.getElementById('expenseList'),
    expenseDateEl: document.getElementById('expenseDate'),
    itemNameEl: document.getElementById('itemName'),
    expenseTypeEl: document.getElementById('expenseType'),
    paymentMethodEl: document.getElementById('paymentMethod'),
    amountEl: document.getElementById('amount'),
    addRecordBtn: document.getElementById('addRecord'),
    voiceInputBtn: document.getElementById('voiceInput'),
    prevMonthBtn: document.getElementById('prevMonth'),
    nextMonthBtn: document.getElementById('nextMonth'),
    voiceModal: document.getElementById('voiceModal'),
    loadingModal: document.getElementById('loadingModal'),
    stopRecordingBtn: document.getElementById('stopRecording'),
    // 自定義彈出視窗元素
    alertModal: document.getElementById('alertModal'),
    alertIcon: document.getElementById('alertIcon'),
    alertTitle: document.getElementById('alertTitle'),
    alertMessage: document.getElementById('alertMessage'),
    alertConfirm: document.getElementById('alertConfirm'),
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk')
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    updateCurrentMonthDisplay();
    loadExpenseData();
});

function initializeApp() {
    // 設定今天的日期為預設值（使用當地時間）
    elements.expenseDateEl.value = getLocalDateString();
    
    // 初始化圖表
    initializeChart();
}

function setupEventListeners() {
    // 新增記錄按鈕
    elements.addRecordBtn.addEventListener('click', addExpenseRecord);
    
    // 語音輸入按鈕
    elements.voiceInputBtn.addEventListener('click', startVoiceInput);
    elements.stopRecordingBtn.addEventListener('click', stopVoiceInput);
    
    // 月份切換按鈕
    elements.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    elements.nextMonthBtn.addEventListener('click', () => changeMonth(1));
    
    // Enter 鍵提交
    [elements.expenseDateEl, elements.itemNameEl, elements.amountEl].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addExpenseRecord();
            }
        });
    });
    
    // 點擊模態框外部關閉
    elements.voiceModal.addEventListener('click', function(e) {
        if (e.target === elements.voiceModal) {
            stopVoiceInput();
        }
    });
}

function updateCurrentMonthDisplay() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    elements.currentMonthEl.textContent = `${year}年${month.toString().padStart(2, '0')}月`;
}

function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    updateCurrentMonthDisplay();
    loadExpenseData();
}

// 切換到指定月份 (格式: YYYYMM)
function switchToMonth(monthKey) {
    if (monthKey && monthKey.length === 6) {
        const year = parseInt(monthKey.substring(0, 4));
        const month = parseInt(monthKey.substring(4, 6)) - 1; // JavaScript 月份從 0 開始
        
        currentMonth.setFullYear(year);
        currentMonth.setMonth(month);
        updateCurrentMonthDisplay();
        loadExpenseData();
        
        console.log('已切換到月份:', monthKey);
    }
}

function getCurrentMonthKey() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    return `${year}${month.toString().padStart(2, '0')}`;
}

async function addExpenseRecord() {
    const data = {
        date: elements.expenseDateEl.value.replace(/-/g, ''),
        itemName: elements.itemNameEl.value.trim(),
        expenseType: elements.expenseTypeEl.value,
        paymentMethod: elements.paymentMethodEl.value,
        amount: parseFloat(elements.amountEl.value) || 0
    };
    
    // 驗證必填欄位
    if (!data.itemName || data.amount <= 0) {
        await showAlert('請填寫項目名稱和正確的金額', '輸入錯誤', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        let response;
        
            const params = new URLSearchParams({
                action: 'addExpense',
                date: data.date,
                itemName: data.itemName,
                expenseType: data.expenseType,
                paymentMethod: data.paymentMethod,
                amount: data.amount,
                monthKey: getCurrentMonthKey()
            });
            
            response = await fetch(`${GAS_WEB_APP_URL}?${params.toString()}`);
        
        const result = await response.json();
        
        if (result.success) {
            // 清空表單
            clearForm();
            
            // 檢查是否記錄到不同月份的頁簽
            if (result.data && result.data.monthKey && result.data.originalMonthKey) {
                if (result.data.monthKey !== result.data.originalMonthKey) {
                    showToast(`記錄已儲存到 ${result.data.monthKey} 月份！`);
                    
                    // 如果需要，可以切換到對應的月份
                    // switchToMonth(result.data.monthKey);
                } else {
                    showToast('記錄新增成功！');
                }
            } else {
                showToast('記錄新增成功！');
            }
            
            // 重新載入當前月份資料
            await loadExpenseData();
        } else {
            throw new Error(result.message || result.error || '新增失敗');
        }
        
    } catch (error) {
        console.error('Error adding expense:', error);
        await showAlert('新增記錄失敗：' + error.message, '操作失敗', 'error');
    } finally {
        showLoading(false);
    }
}

function clearForm() {
    elements.itemNameEl.value = '';
    elements.amountEl.value = '';
    elements.expenseTypeEl.selectedIndex = 0;
    elements.paymentMethodEl.selectedIndex = 0;
    // 保持日期為今天（使用當地時間）
    elements.expenseDateEl.value = getLocalDateString();
}

async function loadExpenseData() {
    try {
        showLoading(true);
        
        const response = await fetch(GAS_WEB_APP_URL + '?action=getExpenses&monthKey=' + getCurrentMonthKey());
        const result = await response.json();
        
        if (result.success) {
            displayExpenseList(result.data);
            updateMonthlyTotal(result.data);
            updateChart(result.data);
        } else {
            console.error('載入資料失敗:', result.error);
            displayExpenseList([]);
            updateMonthlyTotal([]);
            updateChart([]);
        }
        
    } catch (error) {
        console.error('Error loading expense data:', error);
        displayExpenseList([]);
        updateMonthlyTotal([]);
        updateChart([]);
    } finally {
        showLoading(false);
    }
}

function displayExpenseList(expenses) {
    if (!expenses || expenses.length === 0) {
        elements.expenseListEl.innerHTML = '<p class="text-center text-white/70 py-8">本月暫無支出記錄</p>';
        return;
    }
    
    const expenseHTML = expenses.map((expense, index) => `
        <div class="glass-card rounded-2xl p-4">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-semibold">${expense.itemName}</span>
                        <span class="text-2xl font-bold">$${expense.amount}</span>
                    </div>
                    <div class="text-sm opacity-80 space-y-1">
                        <div>${formatDate(expense.date)}</div>
                        <div class="flex gap-4">
                            <span class="bg-white/20 px-2 py-1 rounded-lg">${expense.expenseType}</span>
                            <span class="bg-white/20 px-2 py-1 rounded-lg">${expense.paymentMethod}</span>
                        </div>
                    </div>
                </div>
                <button onclick="deleteExpense(${index})" class="delete-btn ml-3 p-2 rounded-lg bg-red-500/30 hover:bg-red-500/50 transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    elements.expenseListEl.innerHTML = expenseHTML;
}

function formatDate(dateString) {
    if (!dateString || dateString.length !== 8) return dateString;
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${year}/${month}/${day}`;
}

function updateMonthlyTotal(expenses) {
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    elements.monthlyTotalEl.textContent = `$${total.toLocaleString()}`;
}

async function deleteExpense(index) {
    const confirmed = await showConfirm('確定要刪除這筆記錄嗎？', '確認刪除');
    if (!confirmed) return;
    
    try {
        showLoading(true);
        
        let response;
        
        const params = new URLSearchParams({
                action: 'deleteExpense',
                index: index,
                monthKey: getCurrentMonthKey()
            });
            
            response = await fetch(`${GAS_WEB_APP_URL}?${params.toString()}`);
        
        const result = await response.json();
        
        if (result.success) {
            await loadExpenseData();
            showToast('記錄已刪除');
        } else {
            throw new Error(result.message || result.error || '刪除失敗');
        }
        
    } catch (error) {
        console.error('Error deleting expense:', error);
        await showAlert('刪除記錄失敗：' + error.message, '操作失敗', 'error');
    } finally {
        showLoading(false);
    }
}

// 語音輸入功能（使用 Web Speech API）
let recognition = null;

async function startVoiceInput() {
    try {
        // 檢查瀏覽器是否支援語音識別
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            await showAlert('您的瀏覽器不支援語音識別功能，請使用 Chrome 或 Edge 瀏覽器', '不支援的功能', 'warning');
            return;
        }

        // 建立語音識別物件
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        // 設定語音識別參數
        recognition.lang = 'zh-TW'; // 繁體中文
        recognition.continuous = false; // 不連續識別
        recognition.interimResults = false; // 不顯示中間結果
        recognition.maxAlternatives = 1; // 只要一個結果
        
        // 語音識別開始
        recognition.onstart = () => {
            console.log('語音識別開始');
            elements.voiceModal.classList.remove('hidden');
            elements.voiceModal.classList.add('flex');
        };
        
        // 語音識別結果
        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            console.log('語音識別結果:', transcript);
            
            if (transcript.trim()) {
                await processVoiceText(transcript);
            } else {
                showToast('未識別到語音內容，請重試');
            }
        };
        
        // 語音識別錯誤
        recognition.onerror = async (event) => {
            console.error('語音識別錯誤:', event.error);
            let errorMessage = '語音識別失敗';
            
            switch (event.error) {
                case 'no-speech':
                    errorMessage = '未檢測到語音，請重試';
                    break;
                case 'audio-capture':
                    errorMessage = '無法存取麥克風';
                    break;
                case 'not-allowed':
                    errorMessage = '麥克風權限被拒絕';
                    break;
                case 'network':
                    errorMessage = '網路連線問題';
                    break;
                default:
                    errorMessage = `語音識別錯誤: ${event.error}`;
            }
            
            await showAlert(errorMessage, '語音識別錯誤', 'error');
            stopVoiceInput();
        };
        
        // 語音識別結束
        recognition.onend = () => {
            console.log('語音識別結束');
            stopVoiceInput();
        };
        
        // 開始語音識別
        recognition.start();
        
    } catch (error) {
        console.error('Error starting voice input:', error);
        await showAlert('啟動語音識別失敗：' + error.message, '操作失敗', 'error');
    }
}

function stopVoiceInput() {
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    elements.voiceModal.classList.add('hidden');
    elements.voiceModal.classList.remove('flex');
}

async function processVoiceText(transcript) {
    try {
        showLoading(true);
        console.log('處理語音文字:', transcript);
        
        let response;
        
        // 使用 GET 方式 (避免 CORS 問題)
            const params = new URLSearchParams({
                action: 'processVoiceText',
                transcript: transcript,
                currentDate: getLocalDateTimeString()
            });
            
            response = await fetch(`${GAS_WEB_APP_URL}?${params.toString()}`);
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // 填入解析的資料到表單
            fillFormWithVoiceData(result.data);
            showToast('語音分析成功！');
        } else {
            throw new Error(result.message || result.error || '語音分析失敗');
        }
        
    } catch (error) {
        console.error('Error processing voice text:', error);
        await showAlert('語音分析失敗：' + error.message, '操作失敗', 'error');
    } finally {
        showLoading(false);
    }
}         

function fillFormWithVoiceData(data) {
    if (data.date) {
        elements.expenseDateEl.value = data.date;
    }
    if (data.itemName) {
        elements.itemNameEl.value = data.itemName;
    }
    if (data.expenseType) {
        elements.expenseTypeEl.value = data.expenseType;
    }
    if (data.paymentMethod) {
        elements.paymentMethodEl.value = data.paymentMethod;
    }
    if (data.amount) {
        elements.amountEl.value = data.amount;
    }
}

// 圖表功能
function initializeChart() {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    expenseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['吃喝', '購物', '住宿', '交通', '學習', '娛樂'],
            datasets: [{
                label: '支出金額',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 205, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 205, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(255, 159, 64, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

function updateChart(expenses) {
    const categories = ['吃喝', '購物', '住宿', '交通', '學習', '娛樂'];
    const categoryTotals = categories.map(category => {
        return expenses
            .filter(expense => expense.expenseType === category)
            .reduce((sum, expense) => sum + expense.amount, 0);
    });
    
    expenseChart.data.datasets[0].data = categoryTotals;
    expenseChart.update();
}

// 工具函數
// 取得當地時間的日期字串 (YYYY-MM-DD 格式)
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 取得當地時間的完整時間字串 (用於 Gemini API)
function getLocalDateTimeString(date = new Date()) {
    const dateStr = getLocalDateString(date);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${dateStr}T${hours}:${minutes}:${seconds}`;
}

function showLoading(show) {
    if (show) {
        elements.loadingModal.classList.remove('hidden');
        elements.loadingModal.classList.add('flex');
    } else {
        elements.loadingModal.classList.add('hidden');
        elements.loadingModal.classList.remove('flex');
    }
}

function showToast(message) {
    // 簡單的提示訊息
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 glass-card rounded-xl px-6 py-3 z-50';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        document.body.removeChild(toast);
    }, 3000);
}

// 自定義警告彈出視窗
function showAlert(message, title = '提示', type = 'info') {
    return new Promise((resolve) => {
        // 設定標題
        elements.alertTitle.textContent = title;
        
        // 設定訊息
        elements.alertMessage.textContent = message;
        
        // 設定圖示
        let iconHTML = '';
        let iconClasses = '';
        
        switch (type) {
            case 'error':
                iconClasses = 'bg-red-500/20';
                iconHTML = `
                    <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>
                `;
                break;
            case 'success':
                iconClasses = 'bg-green-500/20';
                iconHTML = `
                    <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                `;
                break;
            case 'warning':
                iconClasses = 'bg-yellow-500/20';
                iconHTML = `
                    <svg class="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>
                `;
                break;
            default: // info
                iconClasses = 'bg-blue-500/20';
                iconHTML = `
                    <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                `;
        }
        
        elements.alertIcon.className = `w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${iconClasses}`;
        elements.alertIcon.innerHTML = iconHTML;
        
        // 顯示彈出視窗
        elements.alertModal.classList.remove('hidden');
        elements.alertModal.classList.add('flex');
        
        // 綁定確認按鈕事件
        const confirmHandler = () => {
            elements.alertModal.classList.add('hidden');
            elements.alertModal.classList.remove('flex');
            elements.alertConfirm.removeEventListener('click', confirmHandler);
            resolve();
        };
        
        elements.alertConfirm.addEventListener('click', confirmHandler);
        
        // ESC 鍵關閉
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                confirmHandler();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

// 自定義確認彈出視窗
function showConfirm(message, title = '確認操作') {
    return new Promise((resolve) => {
        // 設定標題和訊息
        elements.confirmTitle.textContent = title;
        elements.confirmMessage.textContent = message;
        
        // 顯示彈出視窗
        elements.confirmModal.classList.remove('hidden');
        elements.confirmModal.classList.add('flex');
        
        // 綁定按鈕事件
        const confirmHandler = () => {
            elements.confirmModal.classList.add('hidden');
            elements.confirmModal.classList.remove('flex');
            cleanup();
            resolve(true);
        };
        
        const cancelHandler = () => {
            elements.confirmModal.classList.add('hidden');
            elements.confirmModal.classList.remove('flex');
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            elements.confirmOk.removeEventListener('click', confirmHandler);
            elements.confirmCancel.removeEventListener('click', cancelHandler);
            document.removeEventListener('keydown', escHandler);
        };
        
        elements.confirmOk.addEventListener('click', confirmHandler);
        elements.confirmCancel.addEventListener('click', cancelHandler);
        
        // ESC 鍵取消
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cancelHandler();
            }
        };
        document.addEventListener('keydown', escHandler);
    });
} 
