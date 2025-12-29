import { readNHICard, detectCardReader } from './cardReader.js';

class CardReaderApp {
    constructor() {
        this.detectButton = document.getElementById('detectButton');
        this.readCardButton = document.getElementById('readCardButton');
        this.statusDisplay = document.getElementById('statusDisplay');
        this.resultDisplay = document.getElementById('resultDisplay');
        this.init();
    }

    init() {
        this.detectButton.addEventListener('click', () => this.detectReader());
        this.readCardButton.addEventListener('click', () => this.handleReadCard());
        
        // 自動執行初始偵測
        this.detectReader();
    }

    async detectReader() {
        this.setButtonState(this.detectButton, true);
        this.clearStatus();
        this.clearResult();

        try {
            const result = await detectCardReader();
            
            if (result.status === "success" || result.IsSuccess) {
                this.displayStatus("✓ 讀卡程式已正確安裝並運行", "success");
                this.setButtonState(this.readCardButton, false);
            } else {
                this.displayStatus("✗ 讀卡程式發生錯誤，請重新安裝", "error");
            }
        } catch (error) {
            if (error.message === "讀卡程式沒有回應") {
                this.displayStatus("✗ 未檢測到讀卡程式，請確認程式是否正在執行", "error");
                
                if (confirm("讀卡程式沒有回應，是否需要安裝說明？")) {
                    alert("請執行 Setup\\Install.ps1 腳本進行安裝");
                }
            } else {
                this.displayStatus(`✗ 檢測讀卡程式時發生錯誤: ${error.message}`, "error");
            }
        } finally {
            this.setButtonState(this.detectButton, false);
        }
    }

    async handleReadCard() {
        this.setButtonState(this.readCardButton, true);
        this.clearResult();

        try {
            const cardData = await readNHICard();
            this.displayResult(cardData);
        } catch (error) {
            this.displayError(error.message);
        } finally {
            this.setButtonState(this.readCardButton, false);
        }
    }

    setButtonState(button, disabled) {
        button.disabled = disabled;
    }

    clearStatus() {
        this.statusDisplay.innerHTML = '';
        this.statusDisplay.className = 'status-box';
    }

    clearResult() {
        this.resultDisplay.innerHTML = '';
    }

    displayStatus(message, type) {
        this.statusDisplay.innerHTML = message;
        this.statusDisplay.className = `status-box ${type}`;
    }

    displayResult(data) {
        if (data.status === "success" || data.IsSuccess) {
            let resultHtml = '<div class="card-info"><h3>📋 健保卡資訊</h3>';

            // 檢查是否有卡片資訊（扁平結構）
            const cardFields = ['健保卡ID', '姓名', '身分證字號', '生日', '性別', '發卡日期'];
            const hasCardData = cardFields.some(field => data.hasOwnProperty(field));

            if (hasCardData) {
                resultHtml += '<table class="info-table">';

                // 顯示主要卡片資訊
                cardFields.forEach(field => {
                    if (data.hasOwnProperty(field)) {
                        resultHtml += `
                            <tr>
                                <td class="label">${field}</td>
                                <td class="value">${data[field]}</td>
                            </tr>
                        `;
                    }
                });

                resultHtml += '</table>';
            } else if (data.CardInfo && Object.keys(data.CardInfo).length > 0) {
                // 回退到巢狀結構（如果有的話）
                resultHtml += '<table class="info-table">';

                for (const [key, value] of Object.entries(data.CardInfo)) {
                    resultHtml += `
                        <tr>
                            <td class="label">${key}</td>
                            <td class="value">${value}</td>
                        </tr>
                    `;
                }

                resultHtml += '</table>';
            } else {
                resultHtml += '<p class="no-data">無卡片資訊</p>';
            }

            resultHtml += '</div>';
            this.resultDisplay.innerHTML = resultHtml;
        } else {
            this.displayError(`讀卡失敗: ${data.errormsg || data.ErrorMsg || '未知錯誤'}`);
        }
    }

    displayError(message) {
        this.resultDisplay.innerHTML = `<div class="error-box">❌ 錯誤: ${message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CardReaderApp();
});

