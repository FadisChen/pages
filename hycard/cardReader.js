/**
 * 健保卡讀卡 API 模組
 * 使用 JSONP 與 NewHyCardReader 通訊
 */

const API_BASE_URL = 'https://vcard.health.gov.tw:7776';

/**
 * 偵測讀卡程式是否正常運作
 * @returns {Promise<Object>} 偵測結果
 */
export async function detectCardReader() {
    try {
        const response = await $.ajax({
            type: 'GET',
            url: API_BASE_URL,
            data: { CardType: 'test' },
            dataType: 'jsonp',
            crossDomain: true,
            cache: false,
            timeout: 3000
        });

        return JSON.parse(response);
    } catch (error) {
        console.error('偵測讀卡程式錯誤:', error);
        
        if (error.readyState === 0) {
            throw new Error('讀卡程式沒有回應');
        }
        
        throw error;
    }
}

/**
 * 讀取健保卡資訊
 * @returns {Promise<Object>} 健保卡資料
 */
export async function readNHICard() {
    try {
        const response = await $.ajax({
            type: 'GET',
            url: API_BASE_URL,
            data: { CardType: 'NHICard' },
            dataType: 'jsonp',
            crossDomain: true,
            cache: false,
            timeout: 5000
        });

        return JSON.parse(response);
    } catch (error) {
        console.error('讀取健保卡錯誤:', error);
        throw error;
    }
}

