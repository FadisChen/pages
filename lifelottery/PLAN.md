# 人生籤 Life Lottery｜開發規劃

> 靈感來自《80 億分之 1》(1in8b.life)。只借用「依真實統計隨機出生、走完一生」的概念；名稱、文案、介面與事件內容全部自行設計，不複製原作。

## 1. 產品目標

- 純靜態網頁遊戲，放在本 repo 的 `lifelottery/`，GitHub Pages 直接可玩；無建置步驟、無後端、無帳號、無 API key。
- 玩家無法選擇出生國家、性別、家庭；系統依各國真實統計抽籤，之後逐年走過一生，於重要關頭做選擇，死亡時間與原因依統計發生。
- 一次人生約 10 / 30 / 60 分鐘（玩家選擇），可暫停、倍速、自動抉擇。
- 結束後產生人生回顧、分享圖卡、給角色的留言，並收進「前世記錄」。
- 完成度標準：可上線的成品，不是原型。行動版優先、深淺色主題、可離線（PWA）、無 console error、通過自動測試。
- 介面語言：繁體中文（字串集中管理，保留未來加語言的空間，但本次只做 zh-Hant）。

## 2. 技術架構

- 原生 HTML + CSS + JavaScript ES modules；不引入框架與外部 CDN（離線可用）。字型用系統字型堆疊。
- 引擎與資料模組不得碰 DOM，要能在 Node 22 直接 `import` 執行（測試與平衡模擬用）。
- 隨機數：可設定種子的 PRNG（mulberry32 或 sfc32），狀態存進存檔，同種子可重現人生。
- 儲存：`localStorage`（全部讀寫包 try/catch，失敗時遊戲照常可玩）。
- PWA：`manifest.webmanifest`、`sw.js`、`icon.svg`，全部放在 `lifelottery/` 內。

### 2.1 獨立性要求（硬性規定）

- 遊戲的所有檔案（程式、樣式、資料、圖示、測試、工具腳本）只能放在 `lifelottery/` 資料夾內。
- 不得 import、`<script src>`、`<link>`、`fetch` 或以相對路徑（`../`）引用 repo 內任何其他資料夾或根目錄的檔案；也不修改其他網頁或 script。
- 所有路徑都用相對於 `lifelottery/` 的路徑，整個資料夾單獨複製到別處或別的網域也能直接運作。
- Service worker 只註冊 `./sw.js`，作用範圍限 `lifelottery/`；快取名稱使用 `lifelottery-` 前綴，只清除自己的舊快取，不碰其他頁面的快取。
- `localStorage` 鍵一律使用 `lifelottery.` 前綴；不讀寫其他頁面的鍵。
- 測試與工具只在 `lifelottery/` 內執行（`node --test lifelottery/tests/`、`npx http-server lifelottery`），不在 repo 根目錄新增 `package.json` 或設定檔。

```
lifelottery/
  index.html
  manifest.webmanifest  sw.js  icon.svg
  css/style.css
  js/
    main.js                 # 進入點、畫面路由
    strings.js              # UI 字串
    storage.js              # 存檔、前世記錄、設定
    engine/
      rng.js                # 種子 PRNG、加權抽選、常態/區間工具
      birth.js              # 抽國家、城鄉、性別、家庭、名字
      mortality.js          # 生命表建構、年度死亡判定、死因
      systems.js            # 每年固定系統：成長、求學、工作收入、婚育、父母老化、退休
      events.js             # 事件載入、條件過濾、加權抽選、套用效果、排程後續事件
      life.js               # 狀態建立、tick(一年)、選擇處理、序列化
      helpers.js            # 事件可用的 h.* 工具
      summary.js            # 結算資料（壽命比較、重要時刻、統計）
    data/
      countries.js          # 各國統計
      eras.js               # 過去/現在/未來 的年代參數
      names.js              # 依地區的名字庫
      causes.js             # 死因分布表
      events/
        index.js            # 匯入並合併所有事件檔
        seed.js             # 階段一示範事件
        childhood.js        # 0–12 歲
        youth.js            # 13–22 歲：求學、升學、初戀、離家
        adult_work.js       # 工作、職涯、金錢
        adult_family.js     # 感情、婚姻、育兒、家人
        migration.js        # 移居、異鄉生活
        health.js           # 疾病、意外、身心
        aging.js            # 中年後、退休、晚年、告別
        world.js            # 依年份與地區的時代事件
        regional.js         # 依所得組別／地區的特有處境
    ui/
      screens/*.js          # landing / setup / lottery / life / death / summary / album / about
      chart.js              # SVG 人生曲線
      sharecard.js          # Canvas 產生分享圖卡
  tests/
    data.test.mjs  events.test.mjs  simulation.test.mjs
    e2e.mjs                 # Playwright 走完一生
```

## 3. 統計資料

- **優先抓真實資料**。本環境可連 `raw.githubusercontent.com`；`ourworldindata.org`、World Bank API、UN、WHO 網域被擋。已確認可用：
  - `https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/latest/owid-covid-latest.csv`：population、life_expectancy、gdp_per_capita、extreme_poverty、human_development_index、male/female_smokers、diabetes_prevalence、median_age。
  - `https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/...`：OWID 歷史資料集（例如歷年平均壽命），可用來做「過去」年代。
  - `https://raw.githubusercontent.com/datasets/population/...`、`datasets/gdp`、`datasets/country-codes`。
- 可再到 owid-datasets 找出生率、嬰兒死亡率、生育率、受教育年限等；找不到的欄位用 UN WPP 2024 / World Bank WDI / WHO GHO 近似值補上。每個欄位在 `countries.js` 註明來源與年份；估計值另外標 `est: [...]`。
- 原始資料下載到 scratchpad，由 Node 腳本轉成 `countries.js`（腳本放 `lifelottery/tools/build-data.mjs`，可重跑）。
- 涵蓋範圍：人口 ≥ 50 萬的國家與地區（約 160 個以上），合計涵蓋全球 99% 以上人口。台灣要有。

每國欄位：

| 欄位 | 說明 |
| --- | --- |
| `code` | ISO3 |
| `name` | 繁中名稱 |
| `region` | `EAS` 東亞、`SEA` 東南亞、`SAS` 南亞、`CAS` 中亞、`MENA` 中東北非、`SSA` 撒哈拉以南非洲、`EUR` 歐洲、`NAM` 北美、`LAC` 拉美加勒比、`OCE` 大洋洲 |
| `income` | `L` / `LM` / `UM` / `H`（世界銀行分組） |
| `pop` | 人口 |
| `births` | 年出生數（或 `cbr` 粗出生率換算） |
| `le` | `{F, M}` 出生時平均餘命 |
| `imr` / `u5mr` | 嬰兒、五歲以下死亡率（每千活產） |
| `tfr` | 總生育率 |
| `school` | `{F, M}` 平均受教育年限（或預期受教育年限） |
| `tertiary` | 高等教育毛入學率 |
| `gdp` | 人均 GDP（PPP） |
| `poverty` | 極端貧窮比例 |
| `urban` | 都市人口比例 |
| `childMarriage` | 女性 18 歲前結婚比例 |
| `srb` | 出生性別比 |
| `smoke` | `{F, M}` 吸菸率 |
| `homicide` / `road` / `suicide` | 每十萬人比率 |
| `cities` | 2–4 個代表城市（繁中） |
| `le1970` / `imr1970` / `le2050` | 年代用；缺值由 `eras.js` 依所得組別推估 |

## 4. 遊戲流程與畫面

1. **首頁**
   - 標題、一句文案、即時跳動的「世界此刻約 82 億人」與每秒新生兒數。
   - 「開始投胎」「前世記錄」「關於」。
   - 15+ 內容提醒：會出現疾病、死亡、暴力、貧窮等統計上會發生的事。
   - 有未完成人生時，顯示「繼續上一段人生」。
2. **設定**
   - 出生年代：過去（約 1970）/ 現在（今年）/ 未來（約 2050）/ 隨機。
   - 抽籤方式：依新生兒人數 / 依現有人口。
   - 人生長度：短（約 10 分）/ 標準（約 30 分）/ 長（約 60 分）。
   - 自動抉擇：開 / 關。
3. **抽籤動畫**
   - 國名快速輪轉後減速停下（尊重 `prefers-reduced-motion`）。
   - 揭曉卡顯示國家、城市或鄉村、性別、家庭經濟（五等分）、名字。
   - 附「今年出生的 100 個嬰兒裡，有 N 個和你同國」，以及該國與世界平均的對照（壽命、嬰兒死亡率、受教育年限、人均所得）。
4. **人生畫面**
   - 頂部：名字、年齡、年份、所在國、人生階段。
   - 五項狀態條：健康、幸福、知識、財富、人際（0–100）。
   - 中央：逐年時間軸，新事件出現時捲動。
   - 控制列：暫停/播放、1×/2×/4×、跳到下一年、自動抉擇開關。
   - 人物面板（家人、伴侶、子女的存歿）可抽屜式展開。
   - 重大事件以選擇卡呈現並暫停時間；開自動抉擇時，倒數幾秒後代為選擇。
5. **離世**
   - 靜默過場：「{名字} 在 {年份} 年離開，享年 {歲}」與死因。
6. **人生回顧**
   - 壽命對照：本國平均、世界平均。
   - 一生五項狀態的 SVG 曲線。
   - 重要時刻清單、一生統計（學歷、工作、伴侶、子女、住過的國家）。
   - 給角色的一句話（存入記錄）。
   - 分享圖卡（Canvas 1080×1350 PNG：下載或 Web Share API）。
   - 「再投胎一次」。
   - 死因為自殺時，附上求助資源。
7. **前世記錄**
   - 歷次人生卡片列表，點開看回顧。
   - 累計統計：活過幾次、總年數、出生過幾個國家。
   - 刪除、全部清除、匯出/匯入 JSON。
8. **關於**
   - 資料來源與方法說明、免責聲明、靈感致謝、求助專線（台灣 1925 安心專線、1995 生命線）。

視覺方向：沉靜、溫暖的「紙本手帳 × 夜空」風格。

- 淺色：米白紙質。深色：深藍夜空。跟隨系統，也可手動切換。
- 色彩一律用 CSS 變數。
- 行動版優先，桌機置中最寬約 760px。
- 狀態變化用 +/− 小數字浮出。
- 支援鍵盤操作與 `aria-live`，並尊重減少動態效果的設定。

## 5. 模擬規則

### 5.1 一年的 tick 順序

1. `age++`，年份 +1。
2. **systems**：
   - 健康隨年齡自然衰退，吸菸、慢性病、貧窮會加速。
   - 求學：入學與輟學機率由該國性別別受教年限、家庭財富、所得組別決定。
   - 工作收入：職業 × 國家 GDP × 學歷 → 財富增減。
   - 戀愛與婚姻：機率依地區典型初婚年齡；童婚依 `childMarriage` 統計。
   - 生育：依 `tfr` 與年齡分布。
   - 父母老化與過世：用同一套生命表。
   - 退休：依所得組別與年齡。
3. **死亡判定**：`q(age) × 風險乘數`。乘數由健康值、財富、慢性病、吸菸、事件留下的 `riskMult` 決定，校準後整體平均約 1。若死亡，依死因表抽死因並結束。
4. **抽事件**：依條件過濾後加權抽選。
   - 每年 0–2 則一般事件。
   - 平均每 2–3 年 1 個需要選擇的重大事件。
   - 優先處理到期的後續事件（`schedule`）。
5. 若沒有事件，依階段與處境產生一句「平凡的一年」摘要（模板庫，約 80 句）。
6. 寫入 `log`、`statHistory`，自動存檔。

### 5.2 生命表（mortality.js）

- `q0` 取 `imr`；1–4 歲由 `u5mr` 推得。
- 5 歲後用 Gompertz–Makeham `μ(x) = A + B·e^{Cx}`。啟動時以二分法調整 `B`，使模擬出的出生時平均餘命符合該國 `le[性別]`（含年代修正）。
- 結果依國家、性別、年代快取。

### 5.3 死因（causes.js）

- 基本表：所得組別 × 年齡帶（0、1–4、5–14、15–29、30–49、50–69、70+）→ 死因機率。
- 死因類別：新生兒狀況、下呼吸道感染、腹瀉、瘧疾、結核、HIV、營養不良、交通事故、溺水、他殺、自殺、衝突、孕產、心血管、中風、癌症、糖尿病、慢性肺病、失智、腎病、肝病、其他。
- 國家修正：`homicide` / `road` / `suicide` 比率、地區（瘧疾只在流行區）。
- 個人修正：吸菸提高肺癌與心血管機率，慢性病提高對應死因機率。

### 5.4 狀態結構（life.js，所有模組必須遵守）

```js
state = {
  v: 1, seed, rng,                          // rng 為 PRNG 內部狀態
  settings: { era, drawMode, pace, autoChoice },
  birthYear, year, age,
  countryCode, homeCountryCode, urban, city,
  gender: 'F'|'M',
  name: { given, family, full },
  family: { wealthQ: 1..5, siblings, mother:{alive,age,name}, father:{alive,age,name} },
  stats: { health, happiness, knowledge, wealth, social },        // 0–100，夾在範圍內
  edu: { level: 'none'|'primary'|'secondary'|'tertiary'|'graduate', inSchool, years },
  work: { status: 'child'|'student'|'employed'|'self'|'unemployed'|'homemaker'|'retired'|'none', job, yearsWorked },
  partner: null | { name, gender, age, status: 'dating'|'married'|'divorced'|'widowed', since },
  children: [ { name, gender, birthYear, alive } ],
  conditions: [],        // 慢性病等 id
  smoker: false,
  riskMult: 1,           // 事件可暫時或永久改變
  flags: {},             // 任意布林或數字旗標
  seen: {},              // eventId -> 最近觸發年齡
  pending: [ { id, atAge } ],
  log: [ { age, year, kind: 'year'|'event'|'choice'|'milestone'|'death', title, text, delta } ],
  statHistory: [ { age, health, happiness, knowledge, wealth, social } ],
  highlights: [],        // 重要時刻（回顧用）
  alive: true,
  death: null | { age, year, causeId, causeText },
}
```

### 5.5 事件 API（data/events/*.js 必須遵守）

每個檔案 `export default [ ...events ]`，由 `events/index.js` 合併。

```js
{
  id: 'youth_exam_pressure',   // 全域唯一，snake_case，前綴用檔名
  title: '大考前夕',
  ages: [16, 18],              // 含頭尾
  weight: 1,                   // 加權抽選權重（預設 1）
  chance: undefined,           // 若設定：符合條件時每年獨立觸發機率（里程碑型事件）
  once: true,                  // 預設 true
  cooldown: 0,                 // once:false 時的冷卻年數
  major: false,                // true = 需要選擇，會暫停
  tags: ['education'],
  cond: (s, h) => h.inSchool() && h.incomeAtLeast('LM'),
  text: (s, h) => `……`,        // 第二人稱「你」，繁中，60–160 字
  effects: { happiness: -3, knowledge: +2 },   // 無選項事件直接套用；也可為 (s,h)=>void
  choices: [                   // 2–3 個；有 choices 時 major 預設 true
    {
      label: '熬夜衝刺',
      cond: (s, h) => true,     // 可選：不符合就不顯示
      effects: { knowledge: +6, health: -4 } | (s, h) => { ... },
      set: ['crammed'], unset: [],
      result: '你考上了第一志願，但那年冬天你病了兩次。',  // 字串或 (s,h)=>string
      schedule: [ { id: 'youth_exam_result', inYears: [0, 1] } ],
      ai: 1,                    // 自動抉擇的權重（可依狀態函式回傳）
    },
  ],
}
```

- `h`（helpers.js）至少提供：
  - 隨機：`rand()`、`chance(p)`、`pick(arr)`、`between(a,b)`。
  - 國家與統計：`country()`、`income()`、`incomeAtLeast(g)`、`region()`、`isRegion(...r)`、`stat(k)`、`era()`、`yearIn(a,b)`。
  - 身分與處境：`inSchool()`、`employed()`、`married()`、`hasPartner()`、`hasChildren()`、`isRich()`（財富 ≥ 70）、`isPoor()`（財富 ≤ 30）、`urban()`、`female()`、`male()`、`has(flag)`。
  - 狀態變更：`set(flag, v=true)`、`addCondition(id)`、`startJob(id)`、`loseJob()`、`setPartner(p)`、`marry()`、`divorce()`、`addChild()`、`migrate(code)`、`addRisk(mult, years?)`、`log(text)`、`highlight(text)`、`name()`、`partnerName()`、`childName(i)`、`city()`、`countryName()`。
  - `die(causeId)` 只給極少數直接致死事件用，例如戰爭、災難；一般死亡交給 mortality。
- 文字規則：
  - 第二人稱、具體生活細節、不說教、不刻板化任何國家或族群。
  - 苦難如實呈現，但保有人的尊嚴與日常微光。
  - 同一事件在不同所得組別要有合理差異（可在 `text` 依 `h.income()` 分支）。
  - 不提供自殺選項。

## 6. 內容規模

- 事件總數 ≥ 320 則，其中 ≥ 130 則有選擇；每檔至少涵蓋四個所得組別中的三個。
- 時代事件 ≥ 40 則，依年份與地區觸發，例如：
  - 經濟與科技：石油危機、網路普及、智慧型手機、2008 金融海嘯。
  - 疫情：2020 疫情。
  - 地區事件：亞洲金融風暴。
  - 未來年代：氣候、AI、高齡化。
- 名字庫：每地區男女名各 ≥ 30、姓氏 ≥ 30。東亞用漢字，日本用日文漢字，韓國用韓文加漢字，其餘用拉丁轉寫。
- 「平凡的一年」模板 ≥ 80 句，依階段與處境分組。

## 7. 品質門檻（測試必須全過）

- `node --test lifelottery/tests/`：
  - **data**：每國欄位齊全、數值範圍合理、權重可抽。
  - **events**：
    - id 唯一、年齡範圍合法、效果鍵合法、`schedule` 目標存在。
    - 對 3000 個隨機狀態呼叫 `cond`、`text`、`result` 不拋錯，產出字串非空，且不含 `undefined` 或 `NaN`。
  - **simulation**：每國模擬 2000 次（自動抉擇），檢查：
    - 平均死亡年齡在 `le` ±2.5 歲內（台灣、日本、美國、奈及利亞、印度、巴西、中國、德國）。
    - 嬰兒期死亡比例在 `imr` ±25% 內。
    - 每次人生的選擇數量落在 15–45。
    - 單次模擬不拋錯。
- `tests/e2e.mjs`（Playwright + 預裝 Chromium，用 `npx http-server` 起站）：
  - `?debug=fast` 讓一年 0.05 秒，開自動抉擇，從首頁走到回顧頁。
  - 分享圖卡產生成功，前世記錄多一筆。
  - 全程 0 個 console error。
  - 手機寬度 390px 截圖無水平捲軸。
- 存檔中途重新整理後可繼續。

## 8. 分工（子代理皆用 Sonnet）

| 階段 | 代理 | 交付 |
| --- | --- | --- |
| 1 | 引擎與資料 | 第 2、3、5 節全部；`seed.js` 約 40 則示範事件；事件檔空殼與 index；data/events/simulation 測試；最小可跑 UI（能走完一生的純文字版） |
| 2A | 介面 | 第 4 節全部畫面、樣式、分享圖卡、前世記錄、PWA、e2e 測試 |
| 2B | 事件：成長 | `childhood.js`、`youth.js`（≥ 110 則） |
| 2C | 事件：成年 | `adult_work.js`、`adult_family.js`、`migration.js`（≥ 120 則） |
| 2D | 事件：健康與時代 | `health.js`、`aging.js`、`world.js`、`regional.js`（≥ 110 則）＋「平凡的一年」模板 |
| 3 | 整合 QA | 全測試、平衡調整（事件頻率、數值曲線）、文案一致性、手機實測截圖、修 bug |

- 各階段代理只改自己負責的檔案；2B–2D 不改引擎。若需要新的 helper，回報給主控，不自行修改。
- 每階段結束由主控審查、跑測試、commit；全部完成後 push 到 `ccr-743650c2-zyql1f`。

## Phase 1 notes（階段 1 完成報告：與原規劃的差異）

- **測試指令**：Node 22 的 `node --test` 不接受目錄參數（位置參數視為 glob），`node --test lifelottery/tests/` 會報錯。請改用 `node --test lifelottery/tests/*.test.mjs`（repo 根目錄）或在 `lifelottery/` 內執行 `npm test`。為此新增了 `lifelottery/package.json`（僅含 `"type": "module"` 與 scripts，無相依套件）。
- **新增檔案**（皆在 `lifelottery/` 內）：`tools/fetch-raw.mjs`、`tools/build-data.mjs`、`tools/countries-seed.mjs`、`tools/countries-header.txt`、`tools/calibrate-risk.mjs`、`js/data/conditions.js`、`js/data/yearly.js`、`js/data/riskref.js`（由 `calibrate-risk.mjs` 產生）、`js/engine/README.md`。`tools/raw/`（下載的原始 CSV）不進版控。
- **狀態結構**：5.4 的欄位全部保留。額外：`settings.eraSetting`（玩家原本選的年代，`settings.era` 為抽籤後的實際年代）；引擎私有資料放在 `flags` 內以 `_` 開頭的鍵（例如 `flags._choice` 為待選擇事件，故可存檔續玩）。事件不得讀寫 `_` 開頭的旗標。
- **死亡時序**：每年先判定「這一年是否存活」，再 `age++`、跑 systems 與事件（PLAN 5.1 的順序略調，語意等價但避免死亡當年還發生事件）。`death.age` 為滿歲數（享年）。
- **countries.js 欄位**：除 PLAN 表格外新增 `pop1970`（過去年代抽籤權重）與 `marryAge {F,M}`（UN 平均初婚年齡）。`tertiary`、`road`、`childMarriage`、`homicide` 四欄在沙盒中找不到可用開放資料集（owid-datasets 的 UNICEF 童婚 CSV 為空檔），全數為憑記憶的估計值，並在每國的 `est` 標示；其餘欄位若為估計也列在 `est`。`le2050` 由統一公式推估（見 countries.js 檔頭），`gdp` 為 2011 國際元 PPP。
- **事件 API**：新增選用欄位 `milestone`（log kind 為 `milestone`）、`highlight`、`choice.hint`；`weight` 可為函式（0 表示只能由 `schedule` 觸發）。新增 helper（共 89 個，清單見 `js/engine/README.md`），PLAN 5.5 列出的全部都有。死因表新增僅供 `h.die()` 使用的 `disaster`。
- **平衡**：生命表以二分法校準到各國（含年代）預期壽命；個人風險乘數以 `data/riskref.js` 正規化，使平均壽命貼近 `le`。事件或系統若改動風險相關效果，需重跑 `node tools/calibrate-risk.mjs`。
- **測試門檻**：每生選擇數 15–45 的檢查在事件總數 < 300 時只印警告（`tests/simulation.test.mjs` 的 `CONTENT_THRESHOLD`）。嬰兒死亡率檢查對低 IMR 國家使用更大的樣本（上限 6 萬）以取得統計上可判定的 ±25%。
- **獨立性（2.1）**：階段 1 所有檔案都在 `lifelottery/` 內；沒有 `../` 指向外部的 import／fetch；localStorage 鍵為 `lifelottery.save`、`lifelottery.settings`；尚未建立 PWA 檔（屬階段 2A）。
