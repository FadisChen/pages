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
   - 出生年代：過去（1955–1990）/ 現在（今年）/ 未來（2040–2070）/ 隨機。
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
- 名字庫：每個語言／文化群男女名各 ≥ 25、姓氏 ≥ 25（無姓氏文化除外）。東亞用漢字，日本用日文漢字，韓國用韓文加漢字，其餘用拉丁轉寫。
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

## Phase 3A notes（階段 3A：整合與校準）

- **壽命校準**：全部內容合併後平均死亡年齡漂移 +2～+3 歲；引擎變更完成後重跑 `node tools/calibrate-risk.mjs 30000 4`，`data/riskref.js` 已重新產生。`riskref.js` 現在按「所得組別 × 性別 × 年代（過去／現在／未來）× 5 歲年齡帶」分列（過去年代的人較貧窮、風險乘數平均較高，合併計算會讓過去年代的壽命偏短 1–2 歲）。校準後各年代平均死亡年齡與預期壽命的差：過去 −0.3、現在 0.0、未來 +0.1（每年代 6000 生）；各國約在 ±1 歲內。凡改動系統、病況或事件的風險效果，都要重跑並以 `npm test` 驗證。
- **新 helper（共 99 個）**：`newPartner` `endRelationship` `setUrban` `setCity` `enroll`／`reenroll` `inTertiary` `incomeAt` `stable` `recentLog`；`byIncome` 改依 `incomeAt()`（時代調整後的所得組別）挑文字。事件層級的 `schedule` 現在對有 `choices` 的事件生效（選擇結算時排入）。`h.die()` 造成的死亡一律排在該事件（或選擇結果）的敘述之後。說明見 `js/engine/README.md`。
- **年代範圍**：過去 1955–1990（均勻）、未來 2040–2070；`eras.js` 對 1970 以前與 2050 以後順著趨勢外推（衰減並夾在合理範圍），GDP 與人口以幾何方式內插。`incomeGroupAt(country, year)` 以年代 GDP 分組（南韓 1975 為中低所得）。
- **名字**：`data/names.js` 由 33 個大區池改為 104 個語言／文化群（每群 ≥ 25 個男名、女名、姓氏；緬甸、不丹為無姓氏），每個國家對應一或多個群並依人口比例抽取（奈及利亞：豪薩／約魯巴／伊博，印度：北印／烏爾都／馬拉地／泰盧固／孟加拉／泰米爾…，瑞士：德／法／義）。東亞姓在前（簡體用於中國、繁體用於台港澳）；衣索比亞、索馬利、馬來、泰米爾採父名制；斯拉夫與波羅的海姓氏依性別變形。父母、伴侶、子女的名字都依該群的規則產生；移居者的子女沿用家庭的文化群。
- **生育率**：`planChildren` 依 TFR、未婚比例與晚婚效率反推「想要的孩子數」，非婚生育只在有計畫且未達目標時發生，計畫外生育機率降到 0.4%；模擬的平均子女數與 TFR 差在 ±15% 以內（`tests/simulation.test.mjs`）。
- **介面**：人生畫面的浮動 +/− 數字移到狀態條下方專用的一列，不再蓋住標籤；時間軸以 `scroll-padding`（由 JS 量測固定表頭與控制列高度）讓 delta 標籤不被表頭或控制列遮住；`sw.js` 快取版本升為 `v2`。
- **新測試**：`tests/helpers.test.mjs`、`tests/names.test.mjs`、`tests/pwa.test.mjs`；`tests/simulation.test.mjs` 新增生育率與出生年份範圍檢查。

## Phase 3B notes（階段 3B：敘事一致性與最後內容檢查）

- **一致性稽核器**：`tests/lib/coherence.mjs`（規則、白名單、模擬驅動）、`tests/coherence.test.mjs`（固定種子，約 20 秒）、`tools/coherence-scan.mjs`（`node tools/coherence-scan.mjs 2500 前綴 [--rule=a,b] [--samples=n] [--json=檔]`，列出矛盾）、`tools/read-life.mjs`（把一段人生印成日誌）。
  稽核器包住所有文字函式，在「效果套用前」與「套用後」各取一次狀態快照，**兩個快照都矛盾**才算（事件本來就可能描述它即將帶來的工作或伴侶）。規則：template（`undefined`/`NaN`/殘留括號/重複標點）、work、work_self、job_noun、school、partner、partner_gone、spouse_early、spouse_gender、kids、parents_dead、grandchildren、toddler、retire、smart、phone、internet、tv、infra、hedge、univ、secondary、gender、siblings、age_adult_theme、age_old_theme，以及整段人生層級的 dup_event、dup_year、first_twice、density、quiet。規則內建例外：自己的回憶、第三人稱、哀悼、假設句、否定句。唯一的白名單在 `ALLOW`（每筆必須有 reason；整批抽樣中從未命中的項目會報為 stale，`rare: true` 除外）。
- **成果**（3000 段人生，`tools/coherence-scan.mjs 3000 final1`）：階段 3A 的內容 68,197 筆旗標（其中重複文字 51,358、單年條目過多 2,747，其餘為文字與狀態矛盾約 14,000）→ 1 筆（單年 5 條）。固定種子測試（1300 段）要求內容規則為 0、density／dup_year 不超過 1%、4 條以上的年份 < 1%（實測約 0.1%）、成年人生平均選擇 15–45（實測約 30）、至少看到 480 種事件。
- **修正的分類**：(1) 職業語彙：`wageEarner()`／`officeJob()` 區分受雇與自營，「同事、薪水、下班、公司、會議室」只給受雇者；(2) 年齡：嬰幼兒語氣、童年才有的場景、成人場景（酒、菸、戀愛、婚姻）依年齡收緊，兒童版本另寫；(3) 家庭狀態：伴侶、孩子、孫輩、雙親、手足依實際存歿分支（`parentsLabel()`、`childHe()`、`hasGrandchildren()` …），家裡的小店依 `familyBusiness()`；(4) 科技與設施年表：`techReady(baseYear)`（依所得與城鄉延後）管手機、智慧型手機、網路、冷氣、電視；(5) 地區與城鄉：氣候事件依城市是否近海（`INLAND_CITIES`）、颶風名單、城鄉版本（`byLiving()`）、`displaced()` 期間不發生村裡的事；(6) 事件之間：`followCond`（後續事件不再適用就丟棄，`'wait'` 則隔年再試）、新增 `schedule[].p`、`again`／`max`、旗標互斥（搬出家門、安置、移居）；(7) 敘事重複：引擎層的重複抑制與每年條目預算。
- **引擎變更**：每年最多 3 條（系統行計入）、重複事件改寫成 `again` 文案、同一人生不重複同一段文字；`runEvents` 先處理到期的後續事件再抽籤；`entryFirst` 讓事件敘述排在它所造成的系統行之前、死亡永遠排最後；`pickYearly` 不重複用「平凡的一年」；新增 13 個 helper（共 112 個，見 `js/engine/README.md`）；`jobWeights` 不讓 18 歲以下、受教育不足的人拿到辦公室與專業職位；子女出生地點依城鄉與財富；`第一根菸`／`戒菸成功` 多次出現時不重複文字。事件 203／573 則有調整，「平凡的一年」由 95 句增至 177 句。
- **疫情**：`seed_pandemic_2020` 現在用事件層級的 `schedule`（含機率 `p`）排入六個後續事件，各自的 `followCond` 再檢查年齡、學籍、職業；沒經歷疫情的人生不會遇到疫苗排隊或重新擁抱。
- **回顧頁**：`getSummary().highlights` 經 `curateHighlights()` 整理（去除重複、只留最後一次生日與第一次「長大離家」、離婚與離婚事件合併、最多 12 則，保持時間順序），並新增 `featuredHighlight` 給分享圖卡；原始清單仍存在 `state.highlights`。兒童早夭的回顧頁換上較溫和的空白文字。
- **人工閱讀**：讀了 17 段完整人生（各時代的低所得鄉村、東亞高所得、台灣、長壽、嬰兒與兒童早夭、童婚、難民、2060 年出生、海灣移工、美國富裕、巴西 1960 年代城市、奈及利亞女性等），修正了自相矛盾、重複、階層刻板印象與語氣問題。
- **新增／更動檔案**：`README.md`、`tests/coherence.test.mjs`、`tests/lib/coherence.mjs`、`tools/coherence-scan.mjs`、`tools/read-life.mjs`；`sw.js` 的 `CACHE_VERSION` 升為 `v3`；`tests/events.test.mjs`、`tests/helpers.test.mjs` 各有小幅調整（後續事件與死亡排序的斷言配合新的排序與 `followCond`）。
- **已知限制**：極少數年份仍有 4–5 條條目（里程碑與兩個事件同年）；受限條件下（例如同時是外籍、喪偶、無子女的人）「平凡的一年」的候選句不夠多時，會在 4 年以後重用；氣候類事件只依國家與城市粗略判斷，沒有逐城市的海拔或海岸資料；文化專屬事件（節慶、飲食）以國家與區域為單位，同一國內的少數族群未再細分。
- **校準與驗證**：內容與系統（`jobWeights`、事件條件）改動後重跑 `node tools/calibrate-risk.mjs 30000 4`，`riskref.js` 已更新；`npm test`（78 項，約 2.5 分鐘）、`node tests/e2e.mjs`（40 項、零 console 錯誤）全數通過。

## 階段 4：改進規劃

### 4.1 目標

1. **人生重心（核心玩法補強）**：原作的關鍵機制是「依年齡決定生活重心」，本作目前缺少。玩家在各人生階段選擇重心，它會持續影響狀態變化、系統機率與事件權重。
2. **出生的機率**：呼應「80 億分之 1」的主題，回顧頁算出「這樣一生」的機率，分享圖卡也顯示。
3. **世界地圖**：揭曉出生地、回顧頁、前世記錄都有地圖。
4. **人生收藏**：前世記錄加上收藏與成就，例如出生過的國家、各大洲、各年代、罕見人生。
5. **在地化細節**：
   - 宗教與文化層，修正「卡達的尼泊爾印度教徒遇到開齋節」。
   - 城市地理：近海、內陸、高地、氣候帶。
   - 當地貨幣金額。
   - 疫情後續當年就能觸發。
   - 「平凡的一年」補齊條件較窄的人生。

### 4.2 人生重心規格（4A 引擎、4B 介面共用）

- `state.focus`：`'balance' | 'study' | 'work' | 'family' | 'health' | 'self'`，預設 `balance`。

  | id | 名稱 | 開放年齡 | 主要影響 |
  | --- | --- | --- | --- |
  | `balance` | 平衡 | 全年齡 | 無加成 |
  | `study` | 學業 | 6–30 | 知識成長、升學與持續就學機率上升；幸福與人際略降 |
  | `work` | 工作 | 15+ | 收入、升遷與工作事件權重上升；健康與家庭略降 |
  | `family` | 家庭 | 16+ | 人際與幸福上升，戀愛、婚姻、生育與家庭事件權重上升；收入略降 |
  | `health` | 健康 | 全年齡 | 健康衰退減緩、風險乘數略降；財富略降 |
  | `self` | 興趣與自我 | 10+ | 幸福上升，興趣、旅行與創作事件權重上升；財富略降 |

- **引擎 API**（`js/engine/life.js` 匯出）：
  - `FOCI`：`[{ id, label, desc, ages: [min, max] }]`
  - `availableFoci(state)`
  - `setFocus(state, id)`：不合法時回到 `balance`，並寫入 `state.focusHistory: [{ age, focus }]`。
- **階段提示**：
  - 在 6、12、18、25、40、60 歲進入新階段的那一年，`advanceYear` 回傳 `focusPrompt: true`，同時存在 `flags._focusPrompt`，重新整理後仍會提示。
  - 自動抉擇時，引擎依狀態、年齡與所得選出合理的重心（`autoFocus(state)`）。
- **效果強度**：
  - 每年狀態加減以 ±1–2 為主。
  - 事件權重乘數介於 0.6–1.8，依事件 `tags` 判斷。
  - 系統機率的調整不超過 ±25%。
- **平衡**：重心不能讓壽命失準。`health` 重心最多讓平均壽命多 1–2 年。全部完成後重跑校準，模擬測試要全過。
- **回顧頁**：顯示各階段的重心時間軸。

### 4.3 分工（子代理皆用 Sonnet）

| 階段 | 代理 | 交付 | 可改的檔案 |
| --- | --- | --- | --- |
| 4A | 引擎與內容 | 人生重心引擎（4.2）、宗教與文化層、城市地理、`h.money()` 當地貨幣、疫情當年後續、toddler 規則、「平凡的一年」補齊；新 helper 寫進 README；測試 | `js/engine/**`（`odds.js` 除外）、`js/data/**`（`worldmap.js` 除外）、`tests/**`（`e2e.mjs` 除外）、`tools/**` |
| 4C | 地圖、機率、收藏 | `tools/build-map.mjs` 與 `js/data/worldmap.js`；`js/engine/odds.js` 機率計算；揭曉出生地、回顧頁、分享圖卡、前世記錄的地圖與機率；收藏與成就 | `js/ui/**`（`screens/life.js` 除外）、`css/**`、`js/strings.js`、`js/storage.js`、`sw.js`、`tests/e2e.mjs`，以及上述新檔 |
| 4B | 重心介面與總驗收 | 人生畫面的重心選擇與階段提示、回顧頁的重心時間軸、`sw.js` 補齊新檔、重新校準、一致性稽核、e2e、讀人生紀錄 | 全部（在 4A、4C 完成後才執行） |

- 4A 與 4C 並行；4B 等兩者完成後才開始。
- 所有工作都遵守 2.1 獨立性要求。

### 4.4 4B 追加項目（使用者確認）

1. **地圖縮放**
   - 點任一張地圖，開啟全螢幕地圖檢視，可拖曳、雙指縮放、滑鼠滾輪縮放，並有放大、縮小、重設按鈕。
   - 小國的標記在放大後仍清楚。
   - 支援鍵盤操作：方向鍵平移、+／− 縮放、Esc 關閉。
   - 尊重減少動態效果的設定。
2. **分享圖卡加地圖**
   - 在 1080×1350 圖卡上加一張小地圖，標出出生國、住過的國家與移居路線。
   - 版面不得溢出；留言三行與名字很長的極端情況都要檢查。
3. **機率補上個人狀況**
   - 主數字「約 1／N」維持母體機率，依國家平均生命表計算。
   - 明細另加一行「以這一生的健康與風險，活到這個歲數的機率約 X%」。計算依據是引擎在這一生實際套用的個人風險乘數，在 `odds.js` 新增函式並加測試。
   - 用一句話說明兩者差別，避免玩家混淆。

## Phase 4C notes（階段 4C：地圖、機率、收藏）

- **世界地圖**：`tools/build-map.mjs`（零相依）下載 world-atlas 2.0.2（npm tarball，自己解 gzip 與 tar）的 `countries-110m.json` 與 datasets/country-codes（ISO 數字碼、大洲），自己解 TopoJSON、Equal Earth 投影、以弧段為單位做 Douglas-Peucker 簡化（相鄰國家共用邊界）、切開跨日界線的環（俄羅斯、斐濟）、輸出 `js/data/worldmap.js`（約 64 KB）：`SHAPES`（ISO3 → 相對 SVG 路徑，even-odd）、`ANCHORS`（標記點）、`DOT_ONLY`、`TINY`、`CONTINENT`、`MAP_W/MAP_H`（1000×435）。173 國全有：164 個有形狀（含台灣），9 個只有圓點（香港、澳門、新加坡、巴林、模里西斯、葛摩、維德角、馬爾他、馬爾地夫）；48 個形狀太小的國家（TINY）在標示時加圓圈。南極洲略去；北賽普勒斯併入 CYP、索馬利蘭併入 SOM、科索沃為 XKX。重建：`node tools/build-map.mjs [下載目錄]`（預設 `tools/raw/map/`，已被 gitignore）。
- **`js/ui/worldmap.js`**：`createWorldMap({ title, desc, birth, lived, route, counts, names, pulse })`。role="img" 加 `<title>`／`<desc>`，色彩全為 CSS 變數（`.wm-wrap`，用 `color-mix` 衍生，淺深色共用），寬度 100%（最大 680px）；脈動、弧線描繪動畫只用 CSS，減少動態時停在靜態終態。揭曉頁（出生地脈動）、回顧頁（出生地、住過的國家、搬家弧線）、前世記錄（依出生次數 1／2／3／4+ 分四階深淺）都使用。
- **機率 `js/engine/odds.js`**（純函式、Node 可測）：國家（依抽籤方式與出生年的占比，用 `babyShare`）× 性別（era 調整後的出生性別比）× 家庭經濟（1/5）× 城鄉（都市化率 × 財富係數，係數複製自 birth.js，測試會抽樣 `drawBirth` 防止偏離）× 離世年齡（生命表 `S(a)·q(a)`，一歲為一格）。以「出生那一年」為條件，所以回答的是「同年出生的人裡，有多少像你」。`lifeOdds`／`oddsFromState`／`oddsFromSummary`（舊記錄缺抽籤方式時預設依新生兒人數）、`humanizeOneIn`（<10 一位小數、<100 整數、其餘兩位有效數字，≥1 萬用萬／億／兆）。引擎不產生文字；字串在 `S.odds`，格式化在 `strings.js` 的 `oneInText`。揭曉頁顯示「像你這樣的人」（不含離世年齡）；回顧頁與分享圖卡顯示完整「這樣一生的機率」；回顧頁列出各項與長條（對數刻度，長條相加即總和）。圖卡版面重排：紙張加高到 1050，機率帶放在壽命長條與曲線之間，頁尾下移。
- **收藏與成就**：`js/ui/achievements.js`（純邏輯，24 個成就，全由前世記錄推導）、`js/ui/collectionview.js`（人生收藏卡：地圖、六格統計、大洲與年代、國家清單；成就卡：紙本印章風徽章，未解鎖為虛線，數量型成就有進度條）。回顧頁死亡後以「該筆記錄加入前後的差集 − 已通知過的」決定新成就，顯示解鎖卡與 toast。`lifelottery.achievements` 只存「已通知過」的時間戳（清除全部記錄時一併清除）；解鎖狀態永遠由記錄推導。
- **舊記錄相容**：記錄新增選用欄位 `meta { drawMode, partnerYears }`（`session.finish` 寫入；`storage.normalizeMeta`）。缺少 `meta`、`era`、`urbanBirth`、`homeCountry.code`、`countriesLived` 等舊欄位時：用國名反查國家代碼、由出生年推年代、抽籤方式預設新生兒、金婚用「已婚或喪偶、未離婚、享年 ≥ 80」估算（享年 − 28）。e2e 有匯入舊格式記錄的檢查。
- **其他**：`sw.js` 的 `CACHE_VERSION` 升為 `v4`，加入 4C 新檔，也補上 4A 目前新增的 `geo.js`、`money.js`、`religion.js`、`focus.js`（4B 驗收時請再核對）；`dom.js` 新增 17 個徽章圖示；`storage.js` 新增 `loadAchievementLog`／`addAchievementLog`；`about` 資料來源加一列地圖。新測試：`tests/odds.test.mjs`、`tests/worldmap.test.mjs`；`tests/e2e.mjs` 加入揭曉地圖與機率、回顧頁機率與地圖、成就 toast、分享圖卡文字（攔截 canvas `fillText`）、前世記錄收藏與舊記錄匯入。
- **已知限制**：機率只含出生條件與離世年齡，不含人生中的選擇；離世年齡用基準生命表，不含個人風險乘數。110m 的地圖在手機上很小，太小的國家只靠圓點與脈動圈辨認；沒有縮放。成就「金婚」對喪偶者的年數是估計。

## Phase 4A notes（階段 4A：人生重心、宗教與文化、城市地理、當地貨幣）

- **人生重心（PLAN 4.2）**：新檔 `js/engine/focus.js`（數字全集中在 `FOCUS_FX` 與 `FOCUS_EVENT_MULT`）。`state.focus`（預設 `balance`）與 `state.focusHistory [{ age, focus }]`；`life.js` 匯出 `FOCI`、`availableFoci(s)`、`setFocus(s, id)`（不合法回到 `balance`，同年再改會取代同一列，改回前一個重心會移除該列，並清掉 `flags._focusPrompt`）、`autoFocus(s)`（依年齡、處境、財富、健康挑一個合理的重心；用種子的雜湊而不是亂數，所以重複呼叫答案相同、也不影響人生的其他部分）。6、12、18、25、40、60 歲進入新階段的那一年，`advanceYear` 回傳 `focusPrompt: true` 並設 `flags._focusPrompt`（存檔後仍在；`setFocus` 或下一次 `advanceYear` 清除）；`advanceYear(s, { auto: true })` 會自己 `setFocus(s, autoFocus(s))`（測試要強制重心時用 `{ auto: true, autoFocus: false }`）。重心超過開放年齡（學業 30 歲後）會在 `advanceYear` 自動回到 `balance`。`getStatus` 多了 `focus`、`focusLabel`、`foci`、`focusPrompt`、`religion`；`getSummary` 多了 `focus`、`focusTimeline`（連續片段 `{ fromAge, toAge, focus, label }`）、`focusYears`、`religion`。舊存檔沒有 `focus`／`focusHistory`／`religion`，`deserialize` 會補成 `balance`、單列歷史、並用種子雜湊抽出宗教（與新人生同一套抽法）。
- **重心的影響**：(1) 每年狀態微調（±0.2–1.5，之後會均值回歸，穩態約為 3–4 倍）與健康目標；(2) 系統機率（皆在 ±25% 內）：輟學、念完中學後升大學、入學、成年後重返教育（學業）、關係與婚姻的時程（家庭提早一年、學業與工作延後）、分手與離婚、生育、解僱、換跑道、退休、吸菸開始／戒菸、慢性病發病、收入百分位目標（工作 +0.06，約 +10% 收入）、死亡風險（工作 +3%）；(3) 事件權重：`events.js` 以事件的 `tags` 查 `FOCUS_EVENT_MULT`，乘數乘在一起後夾在 0.6–1.8，並同樣套用在 `chance` 型事件的機率上。詞彙與細節見 `js/engine/README.md` 第 3 節。
- **事件標籤**：標籤本來是自由標記，這次整理出詞彙（study／work／family／wellness／trouble／self 六類，見 README）：替 50 則事件補上對應標籤（健檢、疫苗、運動、作息、興趣、旅行、創作、照顧者、獨立等），新增 19 則事件：8 則興趣、旅行與健康習慣（`youth_hobby_draw`、`youth_friends_trip`、`work_creative_evenings`、`family_weekend_trip`、`health_morning_walk`、`health_sleep_routine`、`health_cooking_change`、`aging_travel_wish`）與下述 11 則宗教與文化事件。現在 592 則事件中約 75% 至少對一種重心有反應，每種重心都有 ≥ 15 則事件變得更常出現（學業 81、工作 154、家庭 147、健康 19、興趣 84 則；健康重心同時讓疾病、意外、慢性病、成癮類事件的權重降到 0.8–0.88）。
- **模擬結果（3000 段人生、同樣的種子、每年強制同一個重心；`tests/focus.test.mjs` 用 2000 段做同樣的方向檢查）**：
  | 重心 | 30 歲受教年數 | 大學比例 | 30–50 歲年收入（2011 國際元） | 平均死亡年齡 | 平均子女數 |
  | --- | --- | --- | --- | --- | --- |
  | balance | 9.28 | 23.8% | 11,508 | 66.5 | 2.27 |
  | study | 10.13 | 36.5% | 12,168 | 66.6 | 2.18 |
  | work | 9.12 | 20.2% | 13,209 | 65.2 | 2.07 |
  | family | 9.17 | 21.3% | 11,312 | 66.5 | 2.39 |
  | health | 9.26 | 23.9% | 11,797 | 67.8 | 2.27 |
  | self | 9.26 | 23.9% | 11,948 | 66.7 | 2.22 |
  | 自動選擇 | 9.61 | 27.2% | 12,178 | 66.5 | 2.21 |
  40 歲時：健康重心的健康值 +5、家庭重心的人際 +7.7／幸福 +5、興趣重心的幸福 +6、學業重心的知識 +10、工作重心的健康 −3／財富 +3.7。健康重心讓壽命多約 1.3 年、工作重心少約 1.3 年（自動選擇與 balance 的平均壽命相同，校準後各國平均死亡年齡與預期壽命相差在 ±1.5 歲內）（符合 4.2「最多 1–2 年」）。
- **宗教與文化層**：新檔 `js/data/religion.js`（檔頭標明為估計值：Pew 風格的各國宗教組成，173 國全有，另有 76 個語言／文化群的覆寫，例如豪薩人 → 穆斯林、伊博人 → 基督徒、印度的旁遮普人 → 錫克教、馬來西亞的華人 → 佛教與民間信仰）。九類：基督宗教、伊斯蘭教、印度教、佛教、民間信仰與傳統宗教、猶太教、錫克教、沒有特定宗教、其他。`state.religion` 在出生時用種子雜湊抽出（過去年代「沒有宗教」的比例較低，未來較高），移居後不變，`addChild` 把它寫進 `child.religion`。helper：`religion()`、`isReligion(...)`、`byReligion({...})`（備用鍵 `_`）、`festival()`（依宗教與**原籍國**；農曆新年、開齋節、宰牲節、排燈節、德賽節、加隆岸節、聖誕節、復活節、潑水節、柬埔寨新年、衛塞節、白節、新薯節、逾越節、瓦薩基節、新年）、`festivalInfo()`、`festivalKey()`、`lunarNewYear()`、`hostFestival()`（所在地多數人的節日；與自家相同則為 null）、`festivalScene(kind)`（60–160 字的節日場景，異鄉生活與「周圍人過別的節日」各自多一句）、`religionIsMinority()`、`worshipPlace()`、`drinks()`、`playsSports()`。節慶與儀式事件改用家庭的傳統：`childhood_festival`、`regional_festival`、`family_festival_gathering`、`aging_family_table`、「平凡的一年」的思鄉句、新衣「只在過年才有」、婚宴的紅包與敬酒、青少年第一杯酒；新增 11 則 `regional_culture_*` 事件（異鄉的節日、齋月、每週聚會、長大的儀式、婚禮儀式、喪禮、飲食規矩、禮拜日與課表衝突、朝聖、祖先的日子、佈施／天課）。婚禮與雙親過世會在同一年自動排入對應的儀式事件（`marry()`、`agePeople()` 寫入 `pending`）。尼泊爾印度教徒在卡達：`festival()` 為德賽節、`hostFestival()` 為開齋節，場景裡「街上的人也在準備他們的開齋節」，不會變成自己過開齋節。
- **城市地理**：新檔 `js/data/geo.js`（估計值）：492 個城市全部標註 `{ coast, alt: low|mid|high, climate: tropical|arid|temperate|continental|polar|highland }`（近海 220／內陸 272；低 371／中 86／高 35；熱帶 172、溫帶 111、乾旱 87、大陸 85、高地 36、極地 1），另有各國的主要氣候（鄉下人用）。helper：`place()`、`coastal()`、`climate()`、`altitude()`、`highAltitude()`（≥ 1500 公尺）、`snowy()`、`hotClimate()`、`byClimate({...})`。`world.js` 的 `INLAND_CITIES` 已移除；颱風／風暴季需近海、海平面上升需近海、海嘯需近海、極寒需大陸或極地氣候、暴風雪需下雪的氣候、熱浪需熱帶／乾旱／大陸氣候、瘧疾與登革熱不發生在高海拔、漁民只出現在近海。世界事件中只影響特定地點的災難（基督城地震、東京的東日本大地震、颶風卡崔娜、海燕、俄羅斯 2010 熱浪、土耳其與敘利亞地震等）也改用城市或機率限制。
- **當地貨幣**：新檔 `js/data/money.js`（購買力平價、通膨與貨幣名稱皆為估計值）：`h.money(usdPpp, { round })` 把 2011 國際元（`h.annualIncome()` 的單位）換成當地、當年的自然金額：`新台幣兩萬元`、`2.5 萬日圓`、`1,200 奈拉`、`400 美元`；台灣、中國、香港、澳門用國字，其餘用阿拉伯數字加「萬」；歐元區國家在加入歐元前用舊貨幣（馬克、法郎、里拉…）；過去年代金額較小、未來較大。換掉了求職詐騙廣告的「月入三萬」（標題改為「免經驗，高薪日領」，金額為月收入的兩倍）與孩子跑腿的「剩兩塊」；匯款句子也用當地貨幣。
- **疫情時序**：`runEvents` 的「到期後續事件」階段現在跑三次（里程碑前、里程碑後、一般事件後），所以事件在本年排入 `inYears: [0, 0]` 的後續會在同一年觸發（受每年 3 條上限約束，超出的順延一年）；`seed_pandemic_2020` 的遠距上課與遠距工作改為 `[0, 0]`，約 93% 的遠距上課落在 2020 年。順帶修了兩個潛在問題：被順延的里程碑型事件（`pending[].recheck`）與被保留位置的里程碑事件在真的出現前會再檢查一次條件（否則人可能在同一年已經搬離了適用的城市）。
- **一致性稽核**：toddler 規則現在抓得到「你學會的第一個長句子」（4 歲起；「最早的玩伴」到 6 歲仍可），對應的事件文字改寫；新增規則 `festival`（節日與宗教詞須符合家庭的傳統，農曆新年只給 `lunarNewYear()` 的家庭；寫「周圍的人」的句子不算）、`climate`（雪、颱風、海嘯、出海與居住地不符）、`drink`（不喝酒的人不會有啤酒、敬酒、宿醉）。「平凡的一年」由 177 句增至 260 句（+83），涵蓋喪偶的異鄉人、難民、慢性病（癌症、憂鬱、氣喘／肺病、心臟病、關節炎、糖尿病、失能、HIV、失智）、45 歲後失業者、單親、照顧者、鄉下長者、高所得退休者、孤兒、童工、家庭主婦、學生家長、匯款的移工、同性伴侶、無子女夫妻、各行業、氣候／海岸／高度、各信仰的日常、1955–1975 與未來年代。其他修正：女性互助小組不再邀請男性、衝突時的「地下室」依處境改寫、球賽受傷只發生在有運動習慣的人（`playsSports()`）、啤酒與敬酒依 `drinks()`、中老年「最愛的啤酒」等。
- **檢查與校準**：`node tools/calibrate-risk.mjs 30000 4` 重跑（自動選擇的重心也在裡面；約 11 分鐘），`data/riskref.js` 已更新：校準後 TWN／JPN／USA／IND／BRA／CHN／DEU 平均死亡年齡與預期壽命相差在 ±0.5 歲內，NGA +1.5；`npm test` 118 項全過（含一致性稽核內容旗標為 0），`node tests/e2e.mjs` 42 項全過、零 console 錯誤，`node tools/coherence-scan.mjs 2000 p4a` 只剩 1 筆（單年 5 條，全是系統行：雙親同年過世、暫別職場、心動、新生命）。人工閱讀了 8 段完整人生（尼日鄉下女性、尼泊爾男性（印度教、工作重心）、日惹穆斯林女性（家庭重心）、台南男性（1982、民間信仰）、拉巴斯男性（基督徒、興趣重心）、索馬利亞鄉下女性（移居瑞典）、斯德哥爾摩 2043 年女性（無宗教、健康重心）、多倫多錫克教男性、泰國清邁鄉下佛教男性），修掉：衝突時的地下室、「過年」穿新衣、女性互助小組邀男性、雨季的捷運給村民、拉巴斯的瘧疾、婚禮儀式晚一年出現、同一段節日場景在童年出現兩次等。
- **新檔**：`js/engine/focus.js`、`js/data/religion.js`、`js/data/geo.js`、`js/data/money.js`（`sw.js` 已列入）、`tests/focus.test.mjs`、`tests/culture.test.mjs`；`tools/read-life.mjs` 新增 `--focus`、`--religion`、`--city` 選項並印出宗教、地點與重心。
- **給 4B 的提示**：重心的 UI 字串用 `FOCI[i].label／desc`；階段提示用 `advanceYear` 的 `focusPrompt`（或 `getStatus(s).focusPrompt`），玩家選擇用 `setFocus(s, id)`，自動抉擇用 `setFocus(s, autoFocus(s))`；回顧頁的時間軸用 `getSummary(s).focusTimeline`（階段名稱可用 `FOCUS_STAGES`，在 `focus.js`）；`getStatus(s).foci` 只含目前年齡開放的重心。
- **已知限制**：宗教只在出生時抽、不會改信或與伴侶不同；每個家庭只有一個主要節日；地理以城市為單位（鄉下人用附近城市的海岸與高度加國家的主要氣候）；貨幣換算用單一係數與簡單通膨；重心沒有「精力總量」限制，只有微調。

## Phase 4B notes（階段 4B：人生重心介面、地圖縮放、個人機率、總驗收）

- **人生重心介面**：新檔 `js/ui/focusview.js`（`focusPicker`：原生 radio 清單，標籤與說明用引擎的 `FOCI`，一行效果提示在 `strings.js` 的 `S.focus.effects`；`focusTimelineCard`：回顧頁的時間軸）。人生畫面（`screens/life.js`）：頂端有「重心」晶片（目前重心，點開是底部抽屜式選擇器，列出目前年齡開放的重心、說明與效果，選好後按「維持／決定」確定）；6、12、18、25、40、60 歲進入新階段時，`advanceYear` 的 `focusPrompt`（或重新整理後的 `getStatus(s).focusPrompt`）會顯示和選擇卡同風格的階段卡「你 18 歲了。接下來這幾年，你想把重心放在…」，時間暫停，目前重心預先選好；同一年若還有待選的事件，重心卡先答，事件卡接著出現。自動抉擇開啟時倒數（`AUTO_CHOICE_SECONDS`），結束時套用 `autoFocus(s)`（玩家動過選項則套用玩家選的），並在「自動」標籤與倒數文字裡指出自動會選哪一個；重心的決定另外在時間軸記一行（只是 UI 提示，不寫入引擎的 `log`）。鍵盤：數字鍵選擇、Enter 確定、`G` 開選擇器（`F` 仍是家人），快速鍵說明已更新。階段卡在手機上只有選中的選項展開長說明，六個選項仍可在一屏內看完。
- **回顧與前世記錄**：重心時間軸（各階段色塊，加上花紋不只靠顏色；刻度為階段起始年齡；圖例列出各重心的年數）、「家庭信仰／傳統：印度教」放在回顧頁開頭（名稱在 `S.religion`）。`storage.normalizeSummary` 新增 `religion`（id 字串，舊記錄為空字串）、`focus`、`focusTimeline`、`riskTrail`，缺少時整塊不顯示。設定頁加了一句說明重心。
- **地圖縮放（4.4.1）**：`js/ui/mapzoom.js`。每張小地圖（揭曉、回顧、前世記錄收藏）現在是一顆按鈕（右下「放大」提示），點開全螢幕 `<dialog>`：指標事件（滑鼠、觸控、筆共用一套）拖曳平移、雙指縮放、滾輪縮放（Ctrl＋滾輪為觸控板縮放）、雙擊放大 2 倍、＋／－／重設按鈕與倍率顯示；鍵盤方向鍵平移（Shift 加大）、`+`／`-` 縮放、`0` 重設、`Esc` 關閉並把焦點還給原按鈕。縮放與平移只改 SVG 的 viewBox（長寬比與舞台相同，線條不糊），縮放範圍 1×–40×，視野不會離開地圖。兩個 CSS 變數由 JS 更新：`--zs` 讓輪廓與弧線維持固定像素寬，`--zm`（縮放的 −0.85 次方）讓小國的圓圈與圓點隨放大而縮小，所以不會蓋住放大後的國家。第一次按放大會朝出生國（或標示的 ≤ 3 個國家的中心）放大。點標示的國家（或最近的標示點，28 px 內）會顯示名稱浮窗（出生地／住過的地方／出生次數），也同步 `aria-live`。尊重 `prefers-reduced-motion`：按鈕與重設改為瞬間跳轉、不播放地圖動畫；顏色全用 CSS 變數，淺深色共用。揭曉、回顧、收藏的地圖各自帶圖例與說明文字給縮放視窗。
- **分享圖卡地圖（4.4.2）**：`sharecard.js` 重排：紙張 y 184–1270，名字／國家兩行縮短、左欄是「享年」大字加死因印章、右欄 470×204 的小地圖（海、陸、出生國紅、住過的國家金，小國與只有圓點的國家加圓圈，多國時以虛線弧線與編號圓點標出搬家順序；`lifeRoute()` 取路線），地圖下方是「1 台灣 → 2 日本 → …」（最多兩行）。其餘區塊（壽命長條、機率帶、曲線、重要時刻與留言）依序往下排。溢出處理：名字、來源、死因、「給某某：」與長條標籤用 `ellipsize` 截斷；留言超過兩行時捨棄「重要時刻」那行、讓留言有三行，不夠的以省略號收尾；無法判定國家的舊記錄不畫地圖，印章回到右側。e2e 攔截 `fillText`（含 transform）檢查每一個字串都在紙張內（x ≤ 1000、y ≤ 1264），涵蓋：一般、64 字元超長英文名、四國移居者、五國 102 歲、不滿一歲、小國與只有圓點的國家加超長死因、無地圖，PNG 另存為 `sharecard-case-*.png`。
- **個人機率（4.4.3）**：主數字維持母體的「約 1／N」。`mortality.dies()` 把每一年實際用在死亡判定的個人風險乘數記進 `flags._riskTrail[age]`（3 位小數；純記錄，不用亂數，人生不變）；`getSummary().riskTrail` 取 0 到享年−1 歲；`odds.js` 新增 `personalSurvival`、`personalFromState`、`personalFromSummary`：`P(走到這個歲數) = Π(1 − min(1, q(x)·m(x)))`，並回傳同樣不含個人風險的基準值與比值；缺資料、軌跡不完整或不滿一歲則回傳 null（舊記錄與舊存檔不顯示這一行）。明細多一行「以這一生的健康與風險，活到 N 歲的機率約 X%」（`percentText`：≥ 10% 整數、1–10% 一位小數、更小兩位、不到 0.1% 顯示「不到 0.1%」），底下是「同國家、同性別、同年代的人平均約 Y%」與一句說明兩者差別（母體機率不看這個人的身體、兩者不能相乘或直接比較）。新測試 6 項（`tests/odds.test.mjs`）：乘數全為 1 時精確等於生命表存活率並與標題的「恰在此歲離世」一致、風險單調、機率範圍與乘數上限、缺資料給 null、引擎記錄的軌跡進入摘要與相簿正規化後逐位相同、軌跡確實跟著健康變化（50 歲時虛弱者的 50–59 歲平均風險較高）、`normalizeSummary` 的容錯。
- **總驗收**：`sw.js` 快取版本 `v5`，補上 `js/ui/focusview.js`、`js/ui/mapzoom.js`；e2e 與 `tests/pwa.test.mjs` 都檢查 `js/` 與 `css/` 的每個檔案都在預先快取清單內。`node tools/calibrate-risk.mjs 30000 4` 重跑（4A 改過 smokeQuit 後的最終版）：`riskref.js` 更新，校準後 TWN／JPN／USA／IND／BRA／CHN／DEU 平均死亡年齡與預期壽命相差 ≤ 0.3 歲，NGA +1.5（與 4A 相同）。`npm test` 124 項全過（4A 的 118 項加 6 項新測試）；`node tests/e2e.mjs` 68 項全過（原 42 項加：階段卡手動／自動／重新整理保留、晶片選擇器與快速鍵、回顧的重心時間軸與信仰、個人機率與引擎一致、地圖縮放的開關／拖曳／滾輪／雙指／鍵盤／浮窗／減少動態／深色、分享圖卡七種極端情況、舊記錄不顯示個人機率），零 console 錯誤；`node tools/coherence-scan.mjs 2000 p4b`：28 萬筆條目，內容旗標 0，4 條以上的年份占 0.09%。截圖（手機 390px 與桌機、淺色與深色的每個畫面、階段卡、選擇器、縮放地圖、分享圖卡各案例）由 e2e 在 `LL_SHOTS` 指定的資料夾產生並逐張檢視。
- **其他小改**：e2e 的手動玩法輔助函式 `advanceOne` 會回答階段卡；`shot()` 等捲動停止再拍；人生畫面的「已暫停」標記移到狀態列第二行，讓手機寬度的標題列容得下重心晶片。
- **已知限制**：重心的時間軸備註只存在畫面上（重新整理後不會重建）；地圖縮放用 110m 資料，放到最大時海岸線仍是粗線條；縮放視窗的雙指手勢只在觸控裝置上實測過（Chromium 觸控模擬）；個人機率只含「活到這個歲數」，不是人生中各項選擇的機率；舊記錄沒有逐年風險，所以沒有這一行；分享圖卡的路線編號在鄰近國家（沙烏地與阿聯）會互相靠近。

## 階段 5：體驗調整

### 5.1 目標與分工（子代理皆用 Sonnet，三者並行）

| 代理 | 主題 | 擁有的檔案 |
| --- | --- | --- |
| 5A | 自適應節奏 | `js/ui/pacing.js`、`js/ui/screens/life.js`、新檔 `tests/e2e-pacing.mjs` |
| 5B | 生平敘述 | 新檔 `js/engine/eulogy.js`、`js/engine/summary.js`、`js/ui/review.js`、`js/ui/sharecard.js`、`js/ui/screens/summary.js`、`js/ui/screens/album.js`、新檔 `tests/eulogy.test.mjs`、新檔 `tests/e2e-eulogy.mjs` |
| 5C | 降低重複感 | `js/engine/events.js`、`js/engine/life.js`、`js/data/events/*.js`、`js/data/yearly.js`、`js/storage.js`、`js/ui/session.js`、新檔 `tests/novelty.test.mjs` |

- **共用檔案**：`js/strings.js`、`css/style.css`、`sw.js`、`PLAN.md`、`README.md`。
  - 只能用小範圍 Edit（不可整檔重寫）。
  - 新字串放在自己命名的區塊（`S.pacing`、`S.eulogy`、`S.novelty`）。
  - CSS 加在檔尾自己的區段。
- **`sw.js`**：新增檔案要加入預快取清單，版本號遞增。
- **`tests/e2e.mjs`** 不改，只執行它確認沒有退步。

### 5.2 自適應節奏（5A）

- 一生的實際總長仍接近玩家選的 10／30／60 分鐘，誤差在 ±15% 以內。
- 時間依「閱讀量」分配：
  - **平淡的一年**（只有一句摘要）：基準的 0.35–0.5 倍。
  - **有事件的年份**：依該年新增文字的字數分配，以每秒約 7 個中文字的閱讀速度估算，設上下限。
  - **有選擇的年份**：照舊暫停。
- 倍速（1×／2×／4×）作用在分配好的時間上。
- 「下一年」可隨時跳過。按住畫面或空白鍵時暫時加速放開即恢復；要與現有快捷鍵相容。
- 新增 `?debug=scale=N`：把所有時間除以 N，用來在測試中驗證真實節奏的比例與總長。
- `tests/e2e-pacing.mjs` 驗證：
  - 平淡年份比事件年份短。
  - 總長落在目標 ±15%。
  - 倍速、跳過、暫停正常。
  - 減少動態效果的設定不受影響。

### 5.3 生平敘述（5B）

- `eulogy.js` 是純模組，可在 Node 執行。依 `getSummary`／state 組出 3–5 句繁中生平，內容涵蓋：
  - 出身：國家、城鄉、年代、家境。
  - 成長與學歷。
  - 工作或謀生方式。
  - 愛與家人：伴侶、子女。
  - 遷徙。
  - 重心或關鍵抉擇。
  - 重大苦難：疾病、戰爭、災難、喪親。
  - 離世：年齡、死因、與該國平均的對照。
  - 收尾一句。
- 語氣依人生而變：早夭、長壽、坎坷、平順、離鄉都要不同。
- 每個句型至少 4 種寫法，以 `stable` 雜湊挑選，同一段人生重新整理後內容不變。
- 不得與事實矛盾。早夭的孩子不談工作；沒有伴侶就不提伴侶。
- 死因為自殺時，語氣要克制，不描述方式。
- **顯示位置**：
  - 回顧頁最上方。
  - 前世記錄的詳細頁。
  - 分享圖卡：取 1–2 句的短版，版面不得溢出。
- **舊記錄相容**：沒有生平時即時產生；資料不足就顯示簡短版。
- `tests/eulogy.test.mjs`：
  - 3000 段人生，全部非空、無 `undefined`／`NaN`。
  - 長度在 60–260 字。
  - 與狀態不矛盾，盡量重用 `tests/lib/coherence.mjs` 的規則。
  - 相同人生的輸出固定。
  - 隨機 50 段人生的開頭句不得超過 30% 相同。

### 5.4 降低重複感（5C）

- **跨人生新鮮度**：
  - `storage.js` 保存跨人生的事件出現次數（`lifelottery.seenEvents`，只存 id 與次數）。
  - `createLife(settings, seed, { novelty })` 傳入這份次數。
  - 非里程碑、非 `chance` 型的事件，抽選權重乘上 `max(0.4, 1 / (1 + 0.45 × 次數))`。
  - 里程碑、時代事件與後續劇情鏈不受影響。
  - 不傳 `novelty` 時行為與現在完全相同，校準因此不受影響。
- **常見事件多種寫法**：
  - 統計模擬中出現率最高的約 60 則一般事件，各補 2–3 種寫法。
  - 依 `stable` 雜湊與跨人生出現次數輪替，讓第二次遇到時換一種說法。
  - 「平凡的一年」同樣考慮跨人生輪替。
- `tests/novelty.test.mjs`：
  - 模擬同一玩家連續 10 段人生（同國、同年代）。
  - 第 2–10 段與前幾段重複的一般事件比例，要明顯低於不開新鮮度的情況（相對降低至少 30%）。
  - 一致性稽核仍為 0。
- 舊存檔沒有 `seenEvents` 時，從前世記錄的 log 推算或從零開始。

## Phase 5A notes（階段 5A：自適應節奏）

- **檔案**：`js/ui/pacing.js`（純模組，Node 可直接 import；常數集中在 `PACING`）、`js/ui/screens/life.js`、`tests/e2e-pacing.mjs`；共用檔只動 `strings.js`（`S.pacing`）、`style.css`（檔尾「Phase 5A」區段）、`sw.js`（版本 `v6`；`pacing.js` 本來就在預快取清單）、`README.md`（一行）。
- **配時公式**（秒，1× 時；停留 = 該年文字在畫面上的時間，看完才進下一年）：
  - `base = 目標秒數 / 預期壽命`（國家、性別、年代的出生時預期壽命）。
  - 平淡的一年（只有一句摘要）：`clamp(base × (0.35 + 0.15 × min(1, 字數/55)), 2.2, 14)`，也就是基準的 0.35–0.5 倍，下限 2.2 秒（俐落但不會一閃而過），上限 14 秒（60 分鐘檔不至於一句話停 20 多秒）。
  - 有事件的年份、以及選擇之後的結果：`clamp((1 + 字數/7 + 0.5×(額外條目數) + 0.8×里程碑數) × K × g, 下限, 100)`。7 字／秒是閱讀速度估算；`K = base × (1 − 0.19×0.43) / (0.81 × 12.4)` 把平均一生攤到目標長度（0.19＝平淡年占比，0.43＝其平均權重，12.4＝其餘年份的平均閱讀估算秒數，皆由 300 段模擬取得）；下限 `max(4, 0.8 + 字數/11 + 0.5×額外條目)`，即使在 10 分鐘檔，任何有事件的年份至少 4 秒，且不會快過每秒 11 字的快讀者。
  - 有選擇的年份：選擇卡出現時時間照舊暫停（不計入長度）；選完後的結果文字依上式配時。
  - 出生畫面最長 8 秒（剛看完抽籤揭曉），縮短的部分由控制器在之後補回。
  - **控制器 `g`**：`g = clamp(1 + (base × 年齡 − 已配時間) / (8 × base), 0.7, 1.5)`，只作用在事件與結果的年份。進度比直線計畫落後就稍微放慢、超前就稍微加快。它看的是「配好的時間」而不是玩家實際花的時間，所以按下一年或開 4× 不會讓之後的年份變慢；重新整理後的存檔從「剛好在進度上」開始。
- **玩家操作**：倍速（1×／2×／4×）乘在配好的時間上；「下一年」（按鈕、`N`、`→`）隨時跳過並重新計時；按住時間軸區域（按鈕、卡片、連結除外）380 毫秒後進入快轉（6×，放開即恢復；移動超過 10px 或瀏覽器接手捲動 `pointercancel` 都不算按住），鍵盤等價是按住 `Shift`（`Shift+Tab` 不算；視窗失焦即放開），與 Space、N／→、1–3、A、F、G、Enter 不衝突。快轉時頂端出現「快轉中」標記。選擇卡、重心卡、抽屜開著、暫停中都不會快轉。觸控螢幕上時間軸關閉文字選取與長按選單，避免長按變成選字。
- **進度提示**：最新一則條目的圓點外圍有一圈細環，隨這一年的停留時間慢慢轉滿（`--yp`，暫停變灰、選擇卡開著或離世時隱藏、快轉時略粗）；頂端細線沿用。減少動態效果時環與細線沒有過渡動畫（只以 100ms 內的階梯更新），節奏本身不受影響。
- **除錯參數**：`?debug=scale=N` 把所有時間除以 N（停留、自動抉擇倒數最少 0.2 秒、離世過場最少 60 毫秒）；可與 `fast` 以逗號並用（`fast` 優先）；`scale=abc`／`0`／負數視為 1。`?debug=fast` 行為不變。畫面根節點公開 `data-load`（quiet／event）、`data-dwell-ms`、`data-plan`、`data-expected-years`、`data-pace` 供測試讀取。
- **300 段真實引擎人生的模擬**（`scratchpad/p5a/collect.mjs`＋`sim.mjs`；其中約 19% 平淡、41% 有事件、39% 有選擇）。每一年的停留秒數（1×）：

  | 檔位 | 平淡年 平均（p10–p90） | 事件年 平均（p10／p50／p90） | 選擇後的結果 平均（p10–p90） | 一生總長（分，平均／p10／p90） |
  | --- | --- | --- | --- | --- |
  | 10 分鐘 | 4.0（3.4–4.8） | 12.7（6.7／11.0／21.3） | 7.1（5.3–9.3） | 10.2／4.6／13.6 |
  | 30 分鐘 | 11.8（10.1–14.0） | 38.0（18.6／33.0／64.9） | 21.3（14.9–28.4） | 30.2／13.9／40.8 |
  | 60 分鐘 | 14.0（上限） | 73.2（40.6／73.0／100） | 47.9（32.3–64.9） | 59.3／27.2／79.2 |

  一生總長會隨實際活多久而不同（早夭的人生本來就短），所以用「總長 ÷（目標 × 活的年數 / 預期壽命）」衡量：活滿 60 年以上的人生（231 段）在三個檔位都 100% 落在 ±15% 內（範圍 10 分鐘 93–113%、30 分鐘 92–104%、60 分鐘 90–102%，平均 97–100%）；活 30–59 年者（38 段）97–100% 在 ±15% 內（唯一超出的是 10 分鐘檔的一段 116.8%）；活 10–29 年者（11 段）91–100% 在 ±15% 內；活不到 10 年的人生（約 7%）因為童年大多是平淡年，總長約為直線比例的 65%，不列入 ±15% 的保證。閱讀舒適度：10 分鐘檔事件年中位數 11 秒、中位數約 83 字（約每秒 7.5 字，接近舒適速度；較長的事件約每秒 8–9 字，算是偏快的一檔），30 與 60 分鐘檔則遠超過 7 字／秒（30 分鐘檔事件年有效速度約 3 字／秒），多出的時間是玩家選長檔位的代價；要快就用倍速或按住。
- **測試**：`node tests/e2e-pacing.mjs`（約 4 分鐘；`LL_ONLY=<regex>` 可只跑符合的項目）。17 項：解析 `?debug=`；配時下限／單調／平淡 < 事件；200 段引擎人生三檔位的 ±15%、平均、平淡與事件比；控制器；兩段完整人生（10 分鐘檔 scale 25、30 分鐘檔 scale 70）的真實時鐘總長與逐類別計時；倍速 1×／4×／2× 的比例；下一年、N、→、暫停、Space；選擇卡讓時間停止與結果配時；按住（點一下、拖曳、按鈕不算；真的按住約 6×；放開恢復；`pointercancel`）；Shift 快轉與其他快捷鍵；進度環；減少動態效果；`?debug=fast`、壞掉的 scale、重新整理續玩；手機截圖（平淡年、事件年、按住快轉）。
- **已知限制**：計時器以 16–50ms 為單位，`scale` 很大時（如 70）每年的誤差被放大，所以測試的實際／配時容許 12%；快轉的 6× 與 380ms 是憑手感訂的；60 分鐘檔的事件年平均超過 1 分鐘，是玩家選了很長的人生，若覺得太慢應該提示改選 30 分鐘；時間軸上的「平淡」判斷只看條目種類，若 5C 把一般事件改成只有一句摘要，也會被當成平淡年處理（行為仍然合理）；重新整理時控制器歸零（假設剛好在進度上）。

## Phase 5B notes（階段 5B：生平敘述）

- **檔案**：新檔 `js/engine/eulogy.js`（純模組、無亂數）、`tests/eulogy.test.mjs`、`tests/e2e-eulogy.mjs`；改 `js/engine/summary.js`（`getSummary().eulogy`）、`js/ui/review.js`（回顧頁與前世記錄詳細頁共用的「生平」卡，緊接在人名／享年區塊之後，求助資訊之前）、`js/ui/sharecard.js`（短版）；共用檔只動 `strings.js`（`S.eulogy`）、`css/style.css`（檔尾 `.eulogy-card`）、`sw.js`（預快取 `eulogy.js`，版本 `v7`）、`README.md`、`js/engine/README.md`。`screens/summary.js`、`screens/album.js` 不需改動（兩者都經 `renderReview`）。
- **設計**：`composeEulogy(summary)` 是「摘要欄位」的純函式（只用 `storage.normalizeSummary` 會保留的欄位：地點、家境、學歷、工作、伴侶、子女、移居、重點時刻、重心時間軸、死因、壽命對照），所以同一段人生在回顧頁、前世記錄與分享圖卡永遠是同一段話，重新整理不變；舊記錄沒有生平時由 `eulogyOf(record)` 即時組出同樣的字。挑句型用 `hash01("名字|出生年|享年|國家|性別#欄位")`，不用亂數。資料不足（沒有國家或出生年）時回簡短版，不拋錯。
- **句型欄位**（每個欄位 ≥ 4 種寫法，共 100 多張表，`TEMPLATES` 匯出並由測試檢查）：出身（嬰兒／兒童／成人各 4–8 種，含年份、國家、城市或鄉村、家境 20 種子句）→ 一生的路（學歷 11 組、工作 1／2／3 種以上、遷徙：避難／工作／求學／定居／返鄉／3 國／4 國以上、重大苦難 12 種、重要時刻 16 種、人生重心）→ 家人（伴侶 6 種狀態、子女＋名字、孫輩、失去孩子、無子女、未婚）→ 離世（死因 21 類各 4 種、與本國同年同性別平均的對照 長／相當／短 各 4 種、自殺另有 4 種克制的寫法）→ 收尾（8 種語氣各 4–5 種，另有「孩子會記得」變體）。短版另有開頭與收尾各 4 種。
- **語氣（shape）**：嬰兒（不滿一歲，只談家人與愛，不談成就、工作、伴侶）、兒童（1–14 歲，依年紀與是否上學寫階段，同樣不談工作與成就）、青年（15–29 歲，「還來不及」）、戰亂／災難（死因為衝突或天災，先寫名字再寫數字）、離鄉（避難者或住過兩國以上；返鄉者另有收尾）、長壽（85 歲以上，或 80 歲以上且比平均多活 6 年）、坎坷（重大苦難加總達門檻：避難、童婚、失去多個孩子、童工、殘疾、憂鬱…）、平凡。判斷順序：嬰兒 > 兒童 > 戰亂／災難 > 青年 > 避難 > 長壽 > 坎坷 > 離鄉 > 平凡。自殺：不寫方式、連「自殺」二字也不用、不做壽命比較，收尾談「被記得、被更早接住」。
- **組句與長度**：固定 3–5 句（出身；一生的路；家人；離世；收尾），目標 60–260 字（上限 252）。「一生的路」依語氣的優先順序挑最多 3–4 個子句（重大苦難與避難一定會寫），太長時先縮短路、再依序省略孫輩、失去孩子、伴侶；重心（≥ 12 年）與一個重要時刻（供弟妹念書、收留手足的孩子、國考、創業、晚年留下的話…，晚年類只在 55 歲以後）會寫進去。
- **事實不矛盾**：兒童不談工作、伴侶、子女與成就；沒有伴侶（也從未結過婚）不出現伴侶詞；沒有子女不提孩子；不寫沒住過的國家、不屬於自己的年份與歲數；死因詞（癌、心臟、戰火、災難…）必須對得上死因、病況或戰亂紀錄；長輩與青年的年齡用語分開。細節：學歷區分「念完／念到一半」（`levelForYears`：7–11 年是中學未畢業，13–15 年是大學未畢業）；`很年輕就結婚` 的歲數會寫出來；`經歷流離之後重返家鄉` 是國內流離（不當成出國避難）；已結束的婚姻之後伴侶欄位可能為空，仍以 `marriages／divorces` 判斷「曾成家」。
- **分享圖卡**：短版（1–2 句、≤ 56 字，不含名字）取代原來的「重要時刻」一行；字體 26px 宋體，兩行（有留言時），沒有留言時最大 32px、最多三行；每句各起一行，放不下先縮字再以「…」截斷。為了騰出約 90px，三列壽命長條行距 44→37、機率框 76→72、曲線高 62→44、各段間距略縮；三行留言與 `tests/e2e.mjs` 的所有圖卡案例（長名、三行留言、四國移民、新生兒、無地圖）都維持在紙面內。
- **測試**：`tests/eulogy.test.mjs`（14 項，約 20 秒）：句型表 ≥ 4；3000 段人生（`lifeConfigs`，含每個國家）全部非空、無 `undefined`／`NaN`、60–260 字、3–5 句、短版 ≤ 60 字且 1–2 句；同一人生重複、經 `normalizeSummary` 之後文字相同；50 段人生開頭不得超過 30% 相同（全語料每種開頭 ≤ 34%）；`tests/lib/coherence.mjs` 的規則（work、partner、kids、school、retire、parents_dead、grandchildren、toddler、technology、univ、secondary…，把「他／她」換成「你」再檢查，職業相關規則對整個職業歷程判斷）對全文與短版都為 0；另有生平專屬規則（兒童不談工作／伴侶／成就、無伴侶、無子女、陌生的年份／歲數／國家、死因詞對應、孫輩、自殺、避難與童婚一定寫、一律有平均對照）；手寫的嬰兒、兒童、自殺、戰亂／災難、四國移民、避難、童婚、長壽、平凡、簡短版案例。`tests/e2e-eulogy.mjs`（20 項，約 1.5 分鐘）：四種環境（手機／桌面 × 淺／深）各玩一整段人生，確認生平卡緊接在人名之後、字數與句數、同種子同字、重新整理與前世記錄詳細頁相同、圖卡上有短版且在紙面內；舊記錄（無 eulogy 欄位）與資料極少的記錄；圖卡 8 種極端案例；零 console 錯誤。
- **人工閱讀**：讀了 33 段（嬰兒 3、兒童 3、青年 3、戰亂／災難 2、長壽 4、坎坷 3、離鄉 3、避難 2、童婚 2、未來年代 3、自殺 1、平凡 4）寫到 `scratchpad/p5b/eulogies.txt`，據此修過：地名連寫（「印度德里」→ 沿用抽籤畫面的「印度的德里附近的鄉村」）、「他戰火逼得他」之類的主詞錯誤、「一輩子」用在年輕人、「晚年」的重要時刻出現在年輕人身上、避難與國內流離混淆、未畢業說成畢業、孫輩與失去孩子的接句、戰亂用了「災難」的收尾。
- **已知限制**：`js/storage.js`（5C 擁有）的 `normalizeSummary` 只保留白名單欄位，所以 `summary.eulogy` 不會被存進前世記錄；目前每次由摘要即時組出（結果相同、無成本）。若之後要連文字一起存，只要在 `normalizeSummary` 回傳物件加一行 `eulogy: x.eulogy && x.eulogy.v === 1 && typeof x.eulogy.text === 'string' ? { v: 1, text: str(x.eulogy.text, 400), short: str(x.eulogy.short, 120), shape: str(x.eulogy.shape, 12), slots: [], opening: str(x.eulogy.opening, 16) } : undefined` 即可（`eulogyOf` 已會優先使用存下來且版本相符的）。匯入的舊檔缺欄位時，「未知」國家一律走簡短版。摘要沒有雙親與手足的資料，所以生平不談他們（只在重要時刻有「失去雙親」「供弟妹念書」時才寫）。生平句型是統計生成的敘述，不會比事件文字更具體；為保持不矛盾，刻意不寫個性、愛好等摘要中沒有的細節。

## Phase 5C notes（階段 5C：降低重複感）

- **跨人生新鮮度**：`localStorage` 鍵 `lifelottery.seenEvents` = `{ v: 1, lives, counts: { 事件代號: 遇過的人生數 } }`（`yearly:N` 是「平凡的一年」第 N 句；只存代號與次數）。`storage.js`：`loadSeenEvents()`（永不拋錯；儲存被封鎖時退回記憶體）、`recordSeenEvents(state)`（一段人生每個遇過的事件加 1）、`deriveSeenFromAlbum()`、`clearSeenEvents()`；`clearAlbum()` 一併清除。`ui/session.js`：`start()` 把計數傳給 `createLife(settings, seed, { ...opts, novelty })`；人生結束（`finish()`，**先計數再 `putRecord`**，否則從相簿推算時會把這一生算兩次）或中途放棄（`discard()`，年齡 > 0）時各計一次，`counted` 旗標防止重複，重新整理後依「已有相簿記錄」還原。相簿記錄的 `meta.events` 存這一生遇過的事件代號（不含「平凡的一年」，約 1 KB），用來在只有相簿、沒有 seenEvents 時（舊版升級、匯入）一次推算出計數；5C 以前的記錄沒有代號，所以從零開始。
- **公式**：一般事件的權重 × `noveltyFactor(次數) = max(0.4, 1 / (1 + 0.45 × 次數))`（1 次 0.69、2 次 0.53、3 次 0.43、4 次起 0.4）；「平凡的一年」每句同一個係數。**不套用**（`isNoveltyExempt`）：`milestone`、`chance` 型、`weight: 0` 的後續事件、`world_` 開頭或標籤 `world`／`era`／`followup`／`chain`／`milestone` 的事件，或事件自己寫 `novelty: false`。`nullWeight`（「什麼都沒發生」）不隨之調整，所以遇過的事件多時事件變少、平凡的一年變多（每生一般事件約 63 → 58）。
- **存檔與相容**：`createLife` 把計數（只留合法代號、正整數）複製進 `state.novelty`，所以存檔與續玩使用同一份、`deserialize` 驗證（壞資料丟棄）；沒有 `novelty`（或空的）時**位元組相同**：同種子、有／無空 novelty 的 `serialize(state)` 完全一樣（`tests/novelty.test.mjs` 80 段）。舊存檔沒有 `novelty`，照舊玩下去。
- **多種寫法**：新檔 `js/data/events/variants.js`（`{ 事件代號: [寫法, …] }`，字串或 `(s, h) => string`；`index.js` 把它掛到 `ev.variants`，也匯出 `VARIANTS`）。83 則一般事件各有 2–3 種額外寫法（共 189 句；最常出現的 23 則 3 種，其餘 2 種），另有 9 句「平凡的一年」在 `yearly.js` 以 `variants` 內嵌。事件的 `text` 是第 0 種；引擎用 `(hash(seed|事件代號) + 跨人生次數) mod (1 + variants 數)` 選：同一生穩定，下一世換下一種，沒有計數時退回雜湊（所以全新玩家也不會固定看到同一種）。**規則**：同樣的情境與狀態限制（不得提到事件本身不能提的伴侶、孩子、工作、學校、手機）、不抽亂數、不改狀態、60–160 字（平凡的一年 40–140）、第二人稱、台灣用語。**重要**：主文字仍然每次都先算一次、重複偵測（`_rt`）仍以主文字為準，所以變體**完全不改變哪些事件發生**（`tests/novelty.test.mjs` 120 段：去掉變體後 `serialize` 扣掉文字完全相同，亂數終態也相同）；因此預設（無 novelty）的事件抽選與壽命校準與 5C 之前逐位元組相同，**沒有重跑校準**。同一生內的可重複事件仍不會把同一段字說兩遍：主文字相同才算重複，換了狀態使主文字不同時，改選這一生還沒說過的寫法（`flags._rtv` 記錄）。
- **最常見事件的選法**：用 `playAudited` 模擬 3000 段人生（`tools/coherence-scan.mjs` 的 `lifeConfigs`，三個年代、含各國），以「一般事件」的出現次數排名；前 60 名約占一般事件出現次數的 50%，前 100 名 65%。`regional_festival`／`childhood_festival` 的主文字來自 `data/religion.js` 的節慶場景，變體用 `h.festival()` 改寫成通用場景（含異鄉一句），不碰 `religion.js`。宗教類事件（`regional_culture_congregation`、`regional_culture_giving`）的變體每種信仰各寫一句；`regional_culture_coming_of_age`、`regional_culture_ancestors` 儀式性太強，未寫變體。
- **重複統計**（`tests/novelty.test.mjs`，同一玩家連續 10 段人生，4 組（台灣／美國／奈及利亞／巴西 1960s 年代）× 8 位玩家，比較第 2–10 段的一般事件）：
  | | 之前（無新鮮度、無變體） | 之後 |
  | --- | --- | --- |
  | 與前幾段**同一事件**的比例 | 72.6% | 67.9%（−6.4%） |
  | 與前幾段**同一事件且同樣字句**的比例 | 約 60.8% | 39.4%（−35%；四組 −32%～−42%） |
  | 「平凡的一年」與前幾段同一句 | 較高 | 較低（測試斷言） |

  PLAN 的公式只能把「同一事件」的比例降低約 6%：每個年齡可抽的事件池本來就小（約 10–20 則），10 段人生內重複是結構性的（權重下限 0.4 只改變相對機率，池子裡的事件都見過時沒有東西可換）。要降低 30% 靠的是字句輪替，所以測試把「重複」定義為玩家實際讀到的樣子：同一事件**且**同樣文字；同時另外斷言同一事件重複比例確實降低。若要讓同一事件也大幅減少，需要更多事件內容，不是調高係數（權重下限 0.03、斜率 3 也只到約 −18%，且每生事件少 25%）。
- **稽核器**：`tests/lib/coherence.mjs` 的 `install()` 也包住 `variants`；`SCHOOL_EXT` 兩個誤報修掉（「離開學校」「離開學」不算學校用語）。修了兩處既有的重複說法：`childhood_first_tv`／`world_tv_arrives` 在同一生兩次都說「第一台電視」（改依 `seenEvent` 換句，只改文字）。
- **新測試**（`tests/novelty.test.mjs`，約 70 秒，16 項；全部 154 項）：公式與 `sanitizeNovelty`、豁免類別、無 novelty／空 novelty 位元組相同、變體不改變發生的事、同一生不重複同樣的字、存檔續玩、世界事件／里程碑／`chance` 事件的頻率不變（± 5%）、10 段人生重複降低 ≥ 30%、變體形式（60–160 字、不抽亂數、不改狀態、各 2–3 種）、變體通過稽核器（1200 段人生，每個事件的各種寫法輪流上場）、儲存（記錄、毀損值、被封鎖的 `localStorage`、相簿推算、計數順序）。
- **驗證**：`npm test` 全過；`node tools/coherence-scan.mjs 2000 p5c`：28 萬筆條目，內容旗標 0（只剩既有的系統行 `重返職場` 重複 1 筆），4 條以上的年份占 0.10%；`node tests/e2e.mjs` 68 項全過、零 console 錯誤；另用 Playwright 小腳本（`?debug=fast`，同種子、同國家連玩兩段）確認：第 1 段後 `lifelottery.seenEvents` 存在（`lives: 1`），第 2 段的存檔帶有 `novelty`（83 個代號），兩段的事件與字句不同。
- **已知限制**：`yearly:N` 是句子在 `yearly.js` 的位置，之後只可在檔尾新增，不可重排或插入（否則舊計數會對到別句）；變體是人工寫的，改了事件的主文字時要一併看變體；中途放棄的人生也計入（讀過就算）；跨裝置不同步（`localStorage`）；舊存檔不補 `novelty`。
