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
- **5D 補記（常數重算）**：5D 把婚禮、頭胎、節慶的文字加長後，10 分鐘檔有近平均的人生超出 +15%（約 1.15）。原因是這些人生的事件年幾乎都貼在可讀下限（`EVENT_MIN`、每秒 11 字）上，控制器只調整事件年、再往下壓也被下限擋住（把 `G_MIN` 降到 0.6 沒用）。改成：落後時（`g` < 1）平淡年也跟著壓（`× clamp(g, 0.85, 1)`，仍不低於 `QUIET_MIN` 2.2 秒，從不放慢）、`G_MIN` 0.7→0.5、`MEAN_READ` 12.4→13.2、`MEAN_QUIET_WEIGHT` 0.43→0.46（由 600 段目前內容的模擬重算：平淡年占 19%、其餘年份平均閱讀估算 13.1–13.3 秒）；下限與測試門檻不變。200 段測試用人生三檔位皆 100% 在 ±15% 內（平均 10 分鐘 100.6%、30 分鐘 99.7%、60 分鐘 97.8%；活滿的人生最高 114%／105%／103%）；文字特別多的人生由下限決定總長（10 分鐘檔的下限總和最高約為目標的 113%），所以日後再加長事件文字時，這一檔最先超出，要再調就得放寬下限或縮短文字。

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

## 階段 5D／5E：家人連續性與其他優化

### 5D 家人連續性（使用者回報：父母雙亡後又出現在婚禮）

模擬 3000 段人生，在雙親都過世之後仍提到家人的條目有 3984 筆，大多是回憶，屬於合理；但有不少確實矛盾：

- **婚禮**：「兩家人擠在同一桌」（systems 的結婚行）、「雙方長輩都在場」（`regional_culture_wedding_rite`），`seed_wedding_planning` 的「兩家人對婚禮的期待」也有同樣問題。
- **年齡錯置**：70 歲的人「省下兩個月的零用錢……母親端出一鍋熱湯」（太陽能燈事件的選項結果）。
- **母親已過世仍在場**：放牧遷徙的選項「母親說，這是為了他們以後可以選擇」，主角 43 歲，母親已過世。
- **伴侶已不在，孩子仍說「爸媽，你們……」**：`接送孫子的那條路`。
- **回老家**：主角 66 歲、雙親已歿，「回老家過節」仍描述成回到父母家。

5D 要做：

1. **擴充稽核規則**：
   - 間接說法：兩家人、雙方長輩、雙方家長、家長、回老家／娘家，以及父母在場的場景。
   - 收緊「回憶」的判定：現在式的「母親說」不算回憶。
   - 伴侶已不在時，不得出現稱呼伴侶與主角為一組的「你們」「爸媽」。
   - 選項結果文字和主角年齡要相符：成人不該有零用錢、放學等場景。
   - 手足、孫輩的存歿與數量要一致。
2. **修正所有被抓出的文字**：
   - 婚禮在父母不在時改寫，讓缺席成為故事的一部分。例如：替你主婚的是叔叔，你在桌上替父母留了兩個位子。
   - 結婚系統行依父母存歿分支。
3. **回歸測試**：3000 段人生的稽核結果仍要是 0 筆；把上面列出的每個實例都寫成固定的回歸測試。

擁有的檔案：

- `js/data/events/*.js`、`js/data/yearly.js`
- `js/engine/systems.js`、`js/engine/helpers.js`
- `tests/lib/coherence.mjs`、`tests/coherence.test.mjs`、`tools/coherence-scan.mjs`

改到風險相關的效果時，要重跑校準。

### 5E 其他優化

1. **同一起點再活一次**：
   - 回顧頁與前世記錄的詳細頁加上「同一起點，再活一次」。
   - 沿用同樣的國家、城鄉、性別、家境、名字、出生年與父母；人生事件使用新的種子。
   - 新人生會標示「重活」，回顧頁可以和前一次對照：壽命、學歷、子女、重心。
   - 引擎提供 `createLife(settings, seed, { birth })`；沒有 `birth` 時，行為和現在完全相同。
2. **載入加速**：
   - 在 `index.html` 加上全部模組的 `modulepreload`。清單由 `tools/` 的腳本產生，測試要檢查清單完整。
   - 確認首屏不必等事件資料就能顯示。
3. **分享預覽**：
   - 加上 Open Graph／Twitter meta：標題、描述、1200×630 的預覽圖。
   - 預覽圖由 `tools/` 的 Playwright 腳本產生 PNG，存進 `lifelottery/`。
   - 分享文字附上網址。
4. **無障礙檢查**：
   - 用 axe-core 對每個畫面做自動檢查，深淺色都要測，並修正問題。axe-core 只裝在 `lifelottery/node_modules`，不進版本控制。
5. **小修**：
   - 鄉村地名改寫得順一點，例如「印度孟買近郊的鄉村」，抽籤畫面與生平都要改。
   - 設定頁的 60 分鐘選項加一句提示，說明節奏較慢。

擁有的檔案：

- `index.html`、`manifest.webmanifest`、`sw.js`
- `js/engine/birth.js`、`js/engine/life.js`、`js/engine/eulogy.js`
- `js/ui/**`、`css/**`、`js/strings.js`、`js/storage.js`、`js/ui/session.js`
- `tests/e2e*.mjs`、新的測試檔、新的 `tools/` 腳本

### 共通規則

- 5D 與 5E 並行。`PLAN.md`、`README.md` 只能小範圍修改。
- 結束時 `npm test`、`node tests/e2e.mjs`、`tests/e2e-pacing.mjs`、`tests/e2e-eulogy.mjs` 都要通過。

## Phase 5E notes（階段 5E：同一起點再活一次、載入速度、分享預覽、無障礙）

- **同一起點，再活一次**：
  - 引擎：`birthOf(state)`（`life.js`）把一段人生的起點取成純 JSON：出生年與年代、國家、城市、城鄉、性別、家境五分位、文化群組與名字（含名字的 token）、手足數、雙親（名字、**出生時**的年紀與是否在世）、家庭信仰、家裡有沒有生意。起點在人生裡不會改變（雙親除外：出生時年紀 = 現在年紀 − 活過的年數，出生時是否在世 = 現在在世、或日誌裡有「母親／父親過世」），所以任何年紀、死後、重新載入後取出的都一樣。`createLife(settings, seed, { birth })` 完全沿用它：完整的起點**不消耗任何亂數**，之後的一切（逐年亂數、事件、死亡）都來自新種子；`normalizeBirth(b)`（`birth.js`）驗證，不可用回 `null`（`createLife` 丟 `Invalid birth`），只有基本欄位的回 `full: false`（舊記錄，見下）。沒有 `birth` 時位元組完全不變：300 個種子（四種年代、兩種抽籤方式）的 `serialize()` 雜湊在改動前後相同（`tests/replay.test.mjs` 另測有／無 `birth: undefined`、70 年後的人生）。
  - 「家裡有沒有生意」由 `stableFlip(seed, …)` 決定，會隨新種子變；為了沿用，`createLife` 在重活的人生裡寫 `flags._fix = { family_business }`，`systems.js` 的 `stableFlip` 多讀一行（只有 `_fix` 有該鍵時才改答案）。**這是 5D 擁有的檔案裡唯一的改動**（2 行）。
  - 相簿：記錄的 `meta.birth`（`storage.cleanStart` 只檢查形狀，不載入引擎）與 `meta.replay = { prev, start, n, partial? }`（重活的是哪一筆記錄、這個起點最早的記錄、同一起點的第幾世）。`start` 是最早那筆記錄的 id，所以前面的人生被刪掉也算得出「同一起點」的次數。進行中的存檔的外層多存 `replay`（`loadSave` 回傳，重新整理後仍是重活）；`state` 本身沒有新欄位。
  - 舊記錄（沒有 `meta.birth`）：按鈕仍然顯示，用摘要重建**部分起點**（出生年／年代、國家、城市、城鄉、性別、家境），名字、文化群組、手足、雙親、信仰重新抽，說明文字會寫明；國家無法辨認的記錄不顯示按鈕。起點壞掉（`normalizeBirth` 為 null）時，按鈕會退回部分起點，再不行才顯示錯誤。部分起點的人生再被重活時，用的是它自己完整的起點（名字與第一世不同）。
  - 介面（`ui/replayview.js`）：回顧頁與前世記錄詳細頁底部的「想再試一次嗎？」卡片與「同一起點，再活一次」按鈕（`data-action="replay"`；有進行中的人生時要確認）；開始後抽籤揭曉頁多一行「重活」徽章與說明；重活的人生的回顧頁，標題下有徽章（第幾世）與「上一世：名字」連結（上一世被刪就寫「上一世的記錄已經刪除」），生平卡之後是「和上一世比較」表：享年（附多活／少活幾年）、學歷、子女、主要重心（時間軸裡年數最長的）、這樣一生的機率、生平開頭（第一句）；手機寬度（< 560px）每列改成兩欄的小卡。前世記錄的清單卡加「重活」標籤。`summary.js` 的離開清理改成只有 `session.recordId === rec.id` 才 `discard()`，否則從回顧頁開始的新人生會被自己的清理丟掉。
  - 成就 `same_start_3`「同一起點活過三次」（icon `replay`）：同一個 `start` 的記錄 ≥ 3 筆；共 25 個成就。新鮮度與 `seenEvents` 照舊（每一世各算一次，e2e 檢查三世之後 `lives: 3`；重活也帶 `novelty`）。
- **載入速度**：
  - 原本首頁靜態 import `session.js` → `life.js` → 全部事件文字，一開始就要 43 個請求、約 1.4 MB 才看得到畫面。現在 `session.js` 以 `import()` 載入引擎（`life.js`、`summary.js`），`restore()`／`start()` 改為 async，路由 `resolve()` 也是；首頁只靠 8 個小模組（約 175 KB 未壓縮）。引擎與事件文字（約 1.2 MB）在頁面閒下來（`load` 後 0.8 秒，`requestIdleCallback`，資料節省模式不做）、玩家把指標移到「開始投胎」或進設定頁時才下載。`landing` 以外的畫面本來就是 `import()`。
  - `tools/build-preload.mjs` 走 `js/main.js` 的 import 圖（靜態 `import`／`export … from`、字面 `import('…')`，路由的 `import(\`./ui/screens/${name}.js\`)` 視為整個資料夾），把 59 個模組寫成 `<link rel="modulepreload">`，放在 `<body>` 結尾、模組腳本之前的標記註解之間：首頁用的 8 個直接列出，其餘 51 個放在 `<template id="preload-later">` 裡（不會執行），`session.warm()` 在上述時機把它們複製進 `<head>`，讓整個引擎平行下載、不必一層一層 import。`tests/pwa.test.mjs` 檢查：清單與 import 圖完全一致、`js/` 下每個模組（除了經典腳本 `theme-init.js`）都在其中（沒有死碼）、首頁的 8 個模組不含引擎或事件資料、`--check` 的輸出等於檔案。`node tools/build-preload.mjs [--check]`。
  - 量測（`tools/measure-load.mjs`，Playwright，冷快取、Service Worker 關閉、本機 http-server〔HTTP/1.1、不壓縮〕＋CDP 節流，中位數，「就緒」＝出現「開始投胎」按鈕）：

    | | 無節流 | 快速 4G（9 Mbit/s、60 ms） | 慢速 4G（1.6 Mbit/s、150 ms） |
    | --- | --- | --- | --- |
    | 之前：FCP／就緒／load／請求數 | 72／325／215 ms／43 | 236／1919／1725 ms／43 | 764／9067／8438 ms／43 |
    | 之後：FCP／就緒／load／請求數 | 80／132／77 ms／12 | 356／411／357 ms／11 | 1516／2040／1513 ms／12 |

    就緒時間縮短 59%／79%／78%，到就緒為止傳輸的資料 413／1462／1561 KB → 90／167／169 KB。**取捨**：節流的連線上，首頁預載的 8 個模組會和樣式表搶頻寬，FCP（只有頂端列與背景）反而晚了 0.1–0.75 秒；試過把預載放在 `<head>`、延到第一個畫面之後（`LL_PRELOAD=fp-raf`：FCP 244／652 ms，但就緒 876／1879 ms）、或拿掉 `countries.js`（就緒 875／1866 ms），都不如現在的設計（就緒最快）。HTTP/2 與壓縮（GitHub Pages）下頻寬競爭小得多，這個差距在實機上應該更小，但沒有量到。「所有模組一次預載」（`LL_PRELOAD=all`）最糟：FCP 1.9／9.2 秒，這就是為什麼其餘模組放在 `<template>` 裡。
- **分享預覽**：`index.html` 有 `og:type／site_name／locale(zh_TW)／title／description／url／image(+type、width、height、alt)` 與 `twitter:card(summary_large_image)／title／description／image／image:alt`；預覽圖 `og-image.png`（1200×630、約 430 KB）由 `tools/build-og-image.mjs` 以 Playwright 渲染 `tools/og-image.html`（深色夜空、月亮、籤筒、大字「人生籤」與三顆標籤；沒有外部資源；字型是系統字型，在這個環境是文泉驛正黑）。**相對的 `og:image` 行不通**（Facebook、X、LINE 等爬蟲不解析相對網址），所以三個網址都是 `https://fadischen.github.io/pages/lifelottery/…`；README 說明搬到別處時要改這三個網址；e2e 的隔離掃描對 `index.html` 允許這個前綴。分享圖卡的 Web Share 文字改為 `shareText(record)`（一句話＋換行＋遊戲網址，網址取自目前頁面的 `origin + pathname`），另有「複製分享文字」按鈕（`navigator.clipboard`，退回 `execCommand`）；e2e 檢查兩者都含網址、不含 `#`／`?`。`og-image.png` 不放進 sw 預先快取（只給爬蟲用）。
- **無障礙**：`tests/a11y.mjs`（獨立的 Playwright 腳本；沒裝 axe-core 時印出說明並以 0 結束；`--strict` 連 moderate／minor 也算失敗；`--verbose` 列出每個節點）。axe-core 4.14.0 只裝在 `lifelottery/node_modules`（`npm install --no-save axe-core`，`lifelottery/.gitignore` 排除）。審查範圍：首頁、設定頁（開著 60 分鐘提示）、抽籤揭曉、人生（階段卡、選擇卡、家人抽屜）、離世、回顧（含分享圖卡）、全螢幕地圖、前世記錄清單與詳細頁、重活的抽籤與回顧（比較表）、關於，淺色與深色、手機（390px）與桌面（1280px）各一輪，外加三段額外的人生各三張選擇卡與回顧（隨機內容裡的 chips、結果、里程碑），共 80 個畫面。**之前**（只有手機寬度、26 個畫面）：critical 4、serious 190、moderate 4、minor 4（節點數）。**之後**：0／0／0／0。修正：
  - `button-name`（critical）：窄螢幕只有圖示的「家人」按鈕加 `aria-label`。
  - `aria-prohibited-attr`（79 個節點）：人生時間軸 chips（`<span aria-label>`）改成「隱藏的視覺文字＋`sr-only` 的完整說明」。
  - `aria-allowed-role`＋`listitem`（49 個節點）：`<ol role="log">` 不合法，改成 `<div role="log">` 包著 `<ol>`（即時朗讀的行為不變）。
  - `heading-order`：時間軸條目標題 `h3` → `h2`（頁面標題是 h1）。
  - `label-content-name-mismatch`（46 個節點）：品牌連結與主題按鈕的 `aria-label` 沒有包含看得見的字（現在品牌用內容當名字，主題按鈕的名字是「主題：自動（跟隨系統）」等，包含畫面上的「自動／淺色／深色」）；前世記錄卡片連結的 `aria-label` 拿掉，卡片文字就是名字。
  - `color-contrast`（16 個節點＋之後抽到的 chips）：淺色主題 `--muted` #6c6354 → #625a4b、`--gold` #b07d1e → #82590c、`--good` #34724a → #286640、`--bad` #b03a26 → #9c3220；人生重心「平衡」色塊改用 `--muted`（文字對比 5.7:1）；離世畫面永遠是夜空（`body::before`），但 `<html>` 仍是淺色底，axe 因此用淺底量深色字，現在離世路由時 `html` 底色也是夜空（`html:has(> body[data-route="death"])`，順便不會在過度捲動時露出淺色邊）。
  - axe 只量自動可判斷的項目：被標為 incomplete 的（例如漸層底上的文字）沒有人工複查，鍵盤操作與螢幕閱讀器的實際體驗也沒有用真正的輔具測過。
- **小修**：鄉村地名統一由 `engine/place.js` 的 `placePhrases(國家, 城市, 城鄉)` 產生：「印度孟買近郊的鄉村」（抽籤揭曉的「出生地」欄位是「孟買近郊的鄉村」，生平同樣）；城市名已含國名的不重複（「墨西哥城」「墨西哥城近郊的鄉村」，原本是「墨西哥的墨西哥城」），城市就是國家的（香港、新加坡、澳門）寫「香港的鄉村」。「誕生」那一行日誌（`life.js`）刻意沒改（「…附近的鄉下」），因為改了會讓所有舊種子的 `serialize()` 不同。設定頁：60 分鐘選項寫「約 60 分鐘・節奏較慢」，選到時多出一段說明（較慢、適合喜歡慢慢讀的人、可用 2×／4× 或按住畫面〔電腦：按住 Shift〕加速；`aria-describedby` 連到選項）。
- **測試**：`tests/replay.test.mjs`（12 項，約 5 秒）：無 `birth` 時位元組不變、`birthOf` 在任何年紀與死後都一樣且可經 JSON 往返、重活沿用所有起點欄位（80 段）且新種子的人生不同、同起點同種子是同一生、家庭生意兩種答案都沿用、173 個國家全部可重活到死、部分起點、壞資料被拒、地名寫法（含全部國家的全部城市）、生平的「近郊的鄉村」、儲存的正規化、成就。`tests/pwa.test.mjs` 多 3 項（preload 清單、首頁不載入引擎、og meta 與預覽圖尺寸）。`tests/e2e.mjs` 多 15 項：首頁不請求引擎、閒下來後才載入、設定頁提示、三世重活（抽籤頁相同、重新整理後仍是重活、徽章與連結、比較表六列、第三世的成就、清單標籤、`seenEvents.lives`）、刪掉上一世、舊記錄的部分起點、進行中的人生要確認、無法重活的記錄沒有按鈕、分享與複製含網址、og／twitter meta 與圖片能載入、鄉村地名。
- **驗證**：`npm test` 191 項全過（5D 同時在改的檔案也在其中）；`node tests/e2e.mjs` 83 項、`tests/e2e-pacing.mjs` 17 項、`tests/e2e-eulogy.mjs` 20 項全過、零 console 錯誤；`node tests/a11y.mjs --strict` 通過（80 個畫面）。
- **已知限制**：重活的 `meta.replay.n` 是「同一起點目前相簿裡的記錄數 + 1」，刪掉中間的記錄再重活，編號可能和先前重複；部分起點（舊記錄）的名字與第一世不同，所以「同一起點」的三世在名字上不一致；比較表的「生平開頭」只取第一句，兩世的第一句常常很像（出身一樣）；`session.restore()` 在直接開 `#/life` 時要先下載引擎（畫面空白一下，之前是首頁就載好）；FCP 的取捨見上。

## Phase 5D notes（階段 5D：家人連續性）

使用者回報「父母雙亡後，在結婚時卻又出現」。原因有三：稽核器的 `parents_dead` 只比對直接的字（爸爸／媽媽／父母）；「回憶」豁免太鬆（整句只要出現「以後」「終於」「曾」就放行，連現在式的「母親說，…」也過關）；而且它不看伴侶不在時的「你們」「爸媽」、也不看成人選項結果裡的小孩場景。5D 把稽核器改成「家人的存歿與數量」都要對得上，再用它找出並修掉所有真正的矛盾。

- **稽核器（`tests/lib/coherence.mjs`）**：
  - **家人規則**（都用 `famScan`）：`parents_dead`（改寫：單方或雙方已歿；間接說法「兩家人、兩邊／雙方的長輩、家長、父母的老家／回老家、回娘家」；只剩一位時寫「爸媽／父母」也算）、`couple_gone`（沒有伴侶、離婚、喪偶卻有孩子說「爸媽，你們…」、「你們夫妻／倆」、「孩子的爸／媽」）、`partner_gone`（加上伴侶的名字）、`kids_dead`（孩子都已過世卻寫「你的孩子」，或寫已歿孩子的名字）、`kids_count`（「兩個孩子／兒子／女兒／孫子」與實際不符）、`kid_gender`（沒有活著的兒子卻寫「你的兒子」）、`siblings_count`（「兩個哥哥」、只有一個手足卻寫「手足們」）、`adult_childish`（成人出現零用錢、放學、寫功課、被家人罵、叫家長）、`young_elder`（40 歲以下出現退休、孫子、養老）、`parent_pronoun`（「媽媽…他的臉」）。
  - **豁免改成以子句為單位**（`famCtx`／`windowAround`）：回憶要有明確的過去詞（想起、當年、小時候、記得、教的、說過、曾經…）出現在關鍵字前兩個子句到後一個子句；悼念詞（過世、葬禮、墓、牌位、相片、空位、少了…）看前後各兩個子句；假設詞（如果、希望、打算…）只看關鍵字**之前**。所以「母親說，這是為了他們以後可以選擇」不再因為下一個子句的「以後」過關。「你說「我媽在等我」」（說話的是主角）不算引言豁免；孩子或鄰居的引言仍可豁免。
  - **精準豁免**：伴侶的父母（公婆、岳父母、對方／伴侶／〈名字〉的爸媽）、孩子的爸媽、「各自的媽媽」、「孫輩的爸媽」（＝主角的孩子）、你是學校「家長」（有孩子的人）、去墓前或老屋或找手足親戚的「回老家」、父母給孩子零用錢、在校門口放學接孩子；`selfContext2` 把「你和曾子怡的婚禮上」的曾子怡算成「你」這一邊（舊的 `selfContext` 會把婚禮上的人名當成第三者，所以婚禮句被放過）；家人名字用整句遮罩（子女的全名包含伴侶的單名時不算）；生平（eulogy）這種整段回顧的句子不當成現在式（`RETRO`）。
  - **壓力測試**：`applyStress(s, st)`／`stressFor(j)`（八分之七的人生在指定年齡讓父母、伴侶或孩子靜靜離開：孤兒、單親、喪偶、離婚、喪子）、`lifeConfigs(n, { stress, novelty })`（四分之三的人生帶 novelty 計數 1–3，每個事件的每種寫法都會輪到）；`tools/coherence-scan.mjs` 加 `--stress`、`--novelty`。
- **旗標數（`node tools/coherence-scan.mjs 3000 …`，新稽核器跑修改前的內容／修改後）**：

  | 規則 | 自然人生 3000 段（前 → 後） | 壓力＋寫法輪替 3000 段（前 → 後） |
  | --- | --- | --- |
  | `parents_dead` | 1120 → 0 | 3030 → 0 |
  | `siblings_count` | 442 → 0 | 489 → 0 |
  | `adult_childish` | 164 → 0 | 151 → 0 |
  | `parent_pronoun` | 115 → 0 | 123 → 0 |
  | `couple_gone` | 15 → 0 | 12 → 0 |
  | `kids_dead` | 12 → 0 | 5 → 0 |
  | `partner_gone`（名字） | 0 → 0 | 2 → 0 |
  | `tv`（既有規則，新抓到一句） | 0 → 0 | 1 → 0 |
  | 合計（不含單年 5 條的 `density`） | 1868 → 0 | 3813 → 0 |

  舊稽核器對舊內容是 0。修改後另外跑了 3 × 6000 段（壓力＋寫法輪替）：只剩 `density` 單年 5 條（既有的軟規則）、一筆 `dup_event`（前後兩個伴侶抽到同一個名字）、一筆 `tv`（已修）。第一輪探查（誤報不算進上表）一共出現 8 種誤報，都已改成規則的豁免：`你們一家`、`你們兩個月`、「要是你爸媽還在」的引言、祖父母的書包、校門口的家長與放學、父母收零用錢、成人進修的「放學後」、姓「曾」的人名被當成「曾經」。
- **修正的分類**（約 30 個事件、系統行與變體）：
  1. **婚禮**：系統的結婚行（所有所得層）加上依雙親存歿與宗教的一句話（雙親俱歿：伊斯蘭＝前一天到墓地唸一段祈禱；基督教＝牧師在禱詞裡提到過世的爸媽、叔叔陪你走到台前；印度教／錫克教＝神龕前點一盞燈；佛教／民間信仰＝牌位前上香、主桌留兩個位子；猶太教＝華蓋旁點一盞小燈；其他＝空位與相片），替你主婚的是叔叔／姑姑／舅舅／阿姨／伯父（40 歲以前）、年紀最長的手足（之後）、或沒有人（你和對方自己牽著手敬酒）；只剩一位時由還在的那位坐主桌、旁邊替過世的那位留一個位子；再婚只輕輕提一句「這一次…」。UM 層的「兩家人擠在同一桌」在雙親俱歿時改成「對方那邊的親友擠了一整桌」（`weddingFolk()`）；對方的父母是否健在由伴侶年齡決定（`partnerParentsGone()`），可以寫成「雙方過世的父母…四個空位」。事件 `seed_wedding_planning`、`regional_culture_wedding_rite`、`family_wedding_day`／`weddingFlavor`、`family_wedding_custom`、`family_matchmaker`、`family_arranged_decision`、`family_meet_parents`（帶對象回家見爸媽 → 去見最近的親人、到墓前說「我帶人來見你們了」）同樣分支。
  2. **回老家／節慶**：`family_festival_gathering`（改名「返鄉過節」，主文與三種寫法在雙親俱歿時改成手足與親戚、爸媽以前坐的位子沒人去坐）、`family_after_divorce`（搬回「沒人住的老屋」）、`health_cancer_treatment`（「回家鄉吃一碗麵」，沒有孫輩就不寫陪孫子）。
  3. **現在式的過世親人**：`regional_pastoral_move`（母親說 → 營地裡的老人說）、`regional_cookstove`、`regional_borehole_well`、`world_china_reform_era`、`childhood_corner_boys`（「我媽在等我」→「家裡的人在等我」）、`youth_orphan_home`（已婚或已有孩子的孤兒不再被「收留」）。
  4. **伴侶不在了**：`aging_last_trip`（「爸媽，你們也該為自己活」依伴侶分支）、`aging_grandchild_care`（沒有活著的孩子就不發生）、`aging_scam_call`（「撥給孫輩的爸媽」→「撥給孩子，問孫輩是不是平安」）、`family_wedding_debt`（離婚或喪偶後不再追著還婚禮的債）。
  5. **數量與性別**：`family_sibling_reunion`、`seed_parent_illness`（標題「父母病了」→「至親病倒了」）、`family_parent_estate`（只有一個手足不寫「手足們」）；`seed_grandchild`（女兒說「我要當媽媽了」，不再是「爸爸」）；`childhood_parent_abroad`（媽媽…她）；`health_postpartum_low` 與育兒事件改用還活著的最小孩子（新 helper `youngestChildName()`）。
  6. **年齡錯置**：`regional_power_cut`（70 歲的「零用錢」→ 菜錢，端湯的是鄰居或伴侶）、`youth_music_obsession`／`youth_family_money_talk`（已婚或已就業的青年用「私房錢」，`pocketMoney()`）、`health_flu_season` 的變體（「大人煮了薑湯」→「有人煮了薑湯」）、`sys:心動`（成人進修的人是「下課」不是「放學」）、`work_civil_exam` 的「退休金」不再被誤抓。
  7. **系統行**：畢業典禮（只剩一位：「也想起沒能看到這一天的父親／母親」；都不在：「心裡對他們說了一聲『我畢業了』」）、第一個孩子（只剩一位：「你第一個打電話告訴母親…」；都不在：「你想起過世的爸媽，在心裡對他們說：『你們的家，又多了一個人。』」）、童婚（雙親都不在時是「親戚替你決定了婚事」）、伴侶取名會避開自己、父母與子女的全名（`makePartner` 只有撞名時才多抽，不改變一般人生）、`yearly:243`（1960 年代低所得城市沒有電視）。
- **新 helper（共 12 個，現共 150 個，見 `js/engine/README.md` 的「Family continuity」）**：`parentsPresent() parentsGone() oneParent() parentsOr(fallback) parentLeft() byParents({…}) standIn() partnerParentsGone() weddingFolk() weddingAbsence() youngestChildName() pocketMoney()`；`systems.js` 匯出 `parentsPresent / standInKin / partnerParentsGone / weddingAbsence / weddingFolk`。
- **回歸測試**（`tests/coherence.test.mjs`，15 → 37 項）：每個實例都有「規則抓得到舊文字、放過新文字」與「真正的事件在該狀態下渲染後通過所有家人規則」兩種檢查（婚禮、雙方長輩、家長、回老家、母親說、只剩一位的「父母」、公婆／岳父母不誤報、「爸媽，你們」、孫輩的爸媽、伴侶名字、孩子的數量／存歿／性別、手足、零用錢與退休）；28 個事件在雙親俱歿時逐一渲染；宗教（9）× 雙親（4）× 年齡（3）的婚禮句；500 段有壓力的人生驗證第一個孩子與畢業典禮的句子、孤兒婚禮不出現「兩家人」且一定提到缺席的雙親；800 段壓力＋寫法輪替的固定種子稽核為 0（同時驗證壓力情境真的產生孤兒、喪偶、離婚、喪子的人生）。
- **人工閱讀**：完整讀了 9 段人生（種子 `r5d-N`，例如 `node tools/read-life.mjs --seed=r5d-534 --era=past --draw=population`；偶數編號用 `population`、奇數用 `births`）：534（上海 1956，4 歲喪母、10 歲喪父，25 歲與 62 歲兩次婚禮）、3（班加羅爾，雙親俱歿、兩個孩子早逝）、69（尼泊爾，5 歲喪母的 15 歲童婚新娘）、642（馬達加斯加，12 歲與 15 歲相繼喪親、11 個孩子）、307（加爾各答穆斯林，婚前雙亡、離婚再婚）、558（里昂，10 歲喪母、33 歲喪父、離婚再婚、喪偶）、446（伊斯蘭馬巴德 2069）、15（喀山，24 與 26 歲喪親）、363（9 歲早夭的孤兒）；另用 grep 檢視 90 與 199 的家人相關行。讀出並修掉：媽媽配「他」的代名詞、女兒說「我要當爸爸了」、已婚的 16 歲孤兒被「收留」、大人煮薑湯給 43 歲的人、第二次婚禮重複擺相片、「1962 年低所得城市聽見誰家的電視」。
- **驗證**：`npm test` 191 項全過（約 4.5 分鐘；含新增的 22 項家人連續性測試）；`node tests/e2e.mjs` 83 項全過、零 console 錯誤；`node tools/coherence-scan.mjs 3000 final1`（自然人生）內容旗標 0，`3000 fin2 --stress --novelty` 內容旗標 0，另外三組各 6000 段（`--stress --novelty`）只剩上述的 `density`、一筆撞名、一筆 `tv`（已修）。校準：沒有改任何死亡風險、事件的 `addRisk` 或系統機率（只動文字、四個事件條件與一個後續事件條件），所以在複本上跑了 `node tools/calibrate-risk.mjs 30000 1` 比對：各格參考值與現行 `riskref.js` 的平均相對差 3.7%（最大 0.36），同樣方法跑未修改的 HEAD 是 3.5%（最大 0.26），差距落在抽樣雜訊內，所以沒有更新 `riskref.js`。
- **已知限制**：手足只有數量，沒有各自的存歿；對方的父母只用年齡決定是否健在，不會出現在別的事件；「回老家」只有在父母已歿且整句沒有手足、親戚、老屋或墓時才抓，所以「回老家」在別的語境仍可能寫成父母家；`couple_gone` 只抓明確的詞（爸媽，你們／你們夫妻／孩子的爸），一般的「你們」不抓；`MEM_STRONG` 的過去詞表是人工整理的，新的回憶說法要補進去；`sw.js` 的快取版本在 5E 的檔案內，資料檔改了之後要一併升版（5D 沒有動）。

## 階段 6：決策主體、居住狀態與前後關聯（使用者回報）

使用者回報：

1. 小孩得了雨季熱（瘧疾），卻能自己決定「買藥或看醫生」。
2. 獨自到國外工作，卻出現照顧父母與小孩的事件。
3. 事件應該要有前後關聯。

主控模擬 1500 段人生，15 歲以下實際被要求做的決定包括：

- 「立刻驗血，吃完整療程的藥」（133 次）
- 「立刻動身，借車送去」
- 「立刻帶著家人撤離」
- 「據理力爭，談判延後」
- 「留下，改種耐旱作物並共用水源」
- 「戴口罩、少出門、有條件就買濾淨機」
- 「先試種一小塊田」
- 「全程守齋」

這不是少數事件寫錯，而是引擎沒有「決策主體」與「居住狀態」這兩個概念。

### 6A 決策主體（誰來做決定）

- **年齡分級**：`h.agency()` 回傳 `infant`（0–5）、`child`（6–11）、`teen`（12–17）、`adult`（18 以上）。
- **事件／選項標註**：
  - `decider: 'family'`：主角是 infant 或 child 時，引擎不出選擇卡，依家人的條件自動決定，例如家境、父母是否在世、所得組別、加權選項。
    - 記錄成一般事件，以「家人決定……」的口吻呈現結果；teen 照常可以選。
  - 選項可標 `who: 'child'`，代表孩子視角的合理選擇，例如告訴大人、躲起來、求大人帶去看醫生。
- **稽核規則 `agency`**：15 歲以下的選項若含大人才能做的決定，就會被標出，例如花錢、買、借、送醫、撤離、談判、種田、辭職、投資、搬家、簽約。
  - 除非選項以孩子的立場寫成，像是「求爸媽帶你去看醫生」，或標了 `who: 'child'`。
- **修正方式**：
  - 改寫成孩子視角的選項，或改為家人決定。
  - 家人決定的結果要讓玩家知道是誰決定的、為什麼，並寫進當年的紀錄。
- **擁有的檔案**：
  - `js/engine/events.js`、`js/engine/life.js`
  - `js/data/events/{childhood,youth,seed,health,regional,world}.js`、`js/data/events/variants.js`
  - 新檔 `tests/lib/rules-agency.mjs`（在 `coherence.mjs` 以一行註冊）、新檔 `tests/agency.test.mjs`

### 6B 居住狀態（誰跟你住在一起）

- **新增狀態** `state.household`：
  - 與父母、伴侶同住與否。
  - 每個孩子住在哪裡：`with_you`、`with_partner`、`with_grandparents`、`home_country`、`independent`。
  - 是否獨自在異地。
- **由 systems 維護**：離家、結婚、移居、孩子長大離家、伴侶過世或離婚、父母過世時更新。
- **移居要決定是否帶家人**：勞工移民多半獨自前往，孩子留給伴侶或祖父母；之後可以由事件接家人過來。
- **新增 helper**：`h.livesWith(who)`、`h.apartFrom(who)`、`h.aloneAbroad()`、`h.childrenWithYou()`、`h.caregiverOfChildren()`。
- **照顧類事件依居住狀態分支**：照顧父母、接送孩子、家人一起吃飯、育兒等。
  - 同住時照常發生。
  - 分隔兩地時改寫成遠距版本：視訊、寄錢、請假飛回去、由手足或伴侶代為照顧。
  - 也可以完全不發生。
- **稽核規則 `household`**：與不同住的家人「一起吃飯、接送、餵、哄睡、陪著」這類同處一地的描述，會被標出。
- **擁有的檔案**：
  - `js/engine/systems.js`、`js/engine/helpers.js`
  - `js/data/events/{adult_family,adult_work,aging,migration}.js`、`js/data/yearly.js`
  - 新檔 `tests/lib/rules-household.mjs`（以一行註冊）、新檔 `tests/household.test.mjs`
- 6B 若在 6A 擁有的檔案裡發現居住相關問題，記在報告裡，由 6C 處理。

### 6C 前後關聯（6A、6B 完成後才開始）

- **選擇的後果追蹤工具**：
  - 列出每個重大選擇設下的旗標，以及後面是否真的有事件讀到。
  - 列出沒有任何後續影響的重大選擇。
  - 目標：八成以上的重大選擇在之後有可見的回響，例如後續事件、條件分支，或回憶句。
- **回憶系統**：
  - `h.remember(key, phrase)` 記下重要時刻。
  - `h.recall(key)` 讓之後的事件、平凡的一年和生平呼應過去，例如「你想起十歲那年，替你借車送醫的是叔叔」。
- **補齊 6B 回報的跨檔案問題**；最後整合稽核、重新校準，並跑全部測試。

### 共通規則

- 6A 與 6B 並行，只改自己擁有的檔案。`PLAN.md`、`README.md`、`tests/lib/coherence.mjs` 只做一行級的小修改。
- 結束前 `npm test`、`node tests/e2e.mjs` 必須通過。風險相關邏輯有變動時，要重跑校準。

## Phase 6A notes（階段 6A：決策主體）

使用者回報「小孩子得了雨季熱（瘧疾），卻能自己決定買藥或看醫生」。原因是引擎沒有「誰來做決定」這個概念：事件的選項一律交給玩家，不管主角是 3 歲還是 40 歲。6A 加上決策分級、「由家人決定」的事件、孩子視角的選項，以及一條稽核規則，並把所有被抓到的事件改完。

- **決策分級**：`agencyOf(age)`／`h.agency()`：`infant`（0–5）、`child`（6–11）、`teen`（12–17）、`adult`（18 以上）；另有 `h.isKid()`（未滿 12）、`h.isTeen()`。helper 由 `events.js` 掛到 `Helpers.prototype`，沒有動 `helpers.js`（6B 擁有）。
- **事件與選項欄位**（`events.js`，`validateEvents` 會檢查；細節見 `js/engine/README.md` 第 10 節）：
  - 事件 `decider: 'family'`：主角未滿 12 歲時不出選擇卡。`decideForFamily` 在可選的選項（`cond` 通過者）裡，依 `ai` 乘上家境係數抽一個，套用效果、旗標、後續事件，**只寫一條一般的 `event` 紀錄**（`by: 'family'`）：事件原文，接著是選項的 `familyResult`（從孩子的眼睛看到的、家人做了什麼）。不是選擇，所以不算進 `getSummary().counts.choices`。12 歲起這個欄位不起作用。
  - 選項 `familyResult`（字串或函式；`false` = 這個選項不會交給家人，由 `cond` 擋在成人專用）、`who: 'child'`（孩子視角：求、告訴、躲、幫忙、跟著；稽核規則放行）、`cost` 0..3（花多少錢與力氣）、`reach` 0..2（多依賴診所、道路等服務）。`choices` 上限由 3 放寬到 6（一次最多看到 2–3 個，其他靠 `cond` 隱藏）。
  - 家境係數：`familyMeans(s)` = 財富五分位 + 所得組別（L −1、LM −0.4、UM +0.2、H +0.6）+ 鄉下（−0.5）+ 父母（剩一位 −0.7、都不在 −1.4）；權重 × `exp(0.75·a·(cost−1.5))`（`a` = clamp((means−3)/1.6, ±1.3)）× `exp(−0.8·偏遠度·reach)`。富裕家庭傾向花錢的選項，貧窮家庭傾向免費或便宜的，偏遠的低所得鄉下更難到診所。
  - 新 helper：`h.agency() h.isKid() h.isTeen() h.whoDecides(salt) h.means() h.carryYou()`。`whoDecides` 依雙親存歿說「爸爸／媽媽／爸媽／奶奶」，都不在時用 5D 的 `standIn()`（叔叔、姑姑、舅舅、阿姨、伯父，或「身邊的大人」），同一人生、年齡、salt 結果固定，不抽亂數。
- **稽核規則 `agency`**（`tests/lib/rules-agency.mjs`，在 `coherence.mjs` 以一行 `RULES.push` 註冊；`tools/agency-scan.mjs [lives] [--static] [--cards]`）：
  - 15 歲以下的選項標籤與結果，含花錢／買、借貸、送醫／看病、撤離、談判、種田與牲畜買賣、辭職／休學、投資、搬家、簽約、申請、繳費等大人的決定就標出；15–17 歲只抓需要成人身分的（貸款、簽約、投資、辭職）；12 歲以上的「一家之主」式決定（做主、當家、扛起家計、替全家決定）一律標出。
  - 放行：孩子視角的措辭（求、央求、告訴、請、商量、哭、躲、藏、陪、幫忙、跟著、用自己的零用錢）、標了 `who: 'child'` 的選項，以及動作的主詞是別人（「爸爸向鄰居借了機車，帶著你騎去診所」）的句子。
  - 三種用法：(1) 文字層規則（註冊進稽核器，看孩子實際選了什麼）；(2) `staticAudit()`：每個有選項的事件 × 0–17 歲 × 五種合成家庭（貧窮鄉下、中等城市、富裕城市、孤兒、單親）；(3) `offeredScan()`：玩 1500 段人生，記錄 18 歲以下實際出現的選擇卡。
- **掃描前後**（`node tools/agency-scan.mjs 1500 --static`，種子 `ag0…ag1499`，三個年代輪流，與主控的掃描相同）：

  | | 修改前 | 修改後 |
  | --- | --- | --- |
  | 未滿 12 歲出現的選擇卡 | 3682 | 2957（另有 727 次由家人決定） |
  | 未滿 15 歲出現的選擇卡 | 5516 | 4786 |
  | 其中含大人才能做的決定 | 1167（未滿 12 歲 681） | 0 |
  | 15–17 歲含成人專屬決定的卡 | 59 | 0 |
  | 靜態稽核（事件 × 年齡 × 家庭） | 8273 組合、1648 筆、51 處 | 8123 組合、0 筆 |

  修改前最多的是：雨季熱的「立刻驗血，吃完整療程的藥」「到藥鋪買藥自己治」、半夜高燒的「立刻動身，借車送去」、離家的決定、灰濛濛的天空（買濾淨機、帶家人去郊外）、又停電了（買發電機）、洪水（帶家人撤離）、綠色革命（貸款買種子）、門禁（談判）。
- **改寫的事件**（共 19 則改為 `decider: 'family'`，加上標籤與結果的修正）：
  - 醫療：`regional_malaria_season`（雨季熱）、`health_clinic_far`（半夜的高燒）、`health_air_quality`、`health_disability_adaptation`。
  - 災難與衝突：`seed_disaster`、`regional_conflict_displacement`、`regional_new_start`、`regional_wildfire_season`、`world_tsunami_2004`、`world_tohoku_2011`、`world_taiwan_921`、`world_syria_2011`、`world_ukraine_2022_home`。
  - 金錢與生計：`regional_drought_harvest`、`regional_cookstove`、`regional_informal_settlement`、`regional_power_cut`、`regional_pastoral_move`、`world_future_climate_migration`。
  - 青少年版本：以上每一則都有 12–17 歲的 `teenOnly` 選項（請家人陪你去診所驗血、跟著家人走到邊境的營地幫忙排隊、拿自己存的零用錢買一盞小燈…）；`world_green_revolution`（只有 12 歲以上，成人用「貸款買新種子」，青少年改為「勸家人聽聽推廣員怎麼說」「幫忙試種一小塊田」）、`health_depression_signs`（青少年「請家人帶你去看醫師」）、`regional_culture_fasting`（青少年「能守多少就守多少」）、`world_future_heat_wave_poor`、`youth_orphan_home`（13–14 歲不再被要求「找工作養活自己」，改為請老師和鄰居幫忙）。
  - 只改措辭：`youth_curfew`（「據理力爭，談判延後」→「把理由一條條說給大人聽，爭取延後」）、`youth_gang_offer`（「接下這份工作」→「點頭答應，跟著他們去做事」）、`childhood_cram_school`、`youth_phone_rules`（結果不再說「談判」）。
  - 改年齡：`regional_fishing_season` 14→18（合作社與休漁是船員的決定）、`seed_scholarship_or_work` 17→18（簽學貸是成年人的事）。
  - 登革熱（`health_dengue_fever`、`childhood_mosquito_season`）本來就沒有選項，文字裡做決定的都是家人，沒有改。
  - 五則的 `variants`（灰濛濛的天空、又停電了、山火季）原本用成人口吻（「不知道該不該出門」「把重要的東西放進袋子」），改成函式：未滿 12 歲時改寫成大人在做事、孩子在旁邊看。
- **家人決定的寫法**：結果由孩子的角度寫，點名是誰決定的（`h.whoDecides`），並依家境分支：雨季熱貧窮鄉下「爸爸背著你走了兩個多鐘頭的路，才到有護理人員的診所…把藥錢數了又數」；湊不出錢時「爸爸只能先用濕毛巾一遍遍替你擦身體，整夜守在草蓆邊沒有睡」；雙親都不在時是叔叔、姑姑、舅舅、阿姨、伯父或「身邊的大人」，只剩一位時不會出現另一位。
- **校準**：自動決定改變了雨季熱等選項的抽選比例，所以量了影響。在 HEAD 複本與「HEAD＋6A 檔案」複本各跑一次 `node tools/calibrate-risk.mjs 30000 1`（同樣種子）：兩份風險參考表的平均相對差 1.25%（最大 12.5%，在稀疏的高齡格），比單次抽樣雜訊（與現行 `riskref.js` 的平均相對差 3.7%）小；再以現行 `riskref.js` 各玩 4000 段人生：平均壽命 66.38 → 66.35 歲，15 歲前死亡 9.20% → 9.22%。差距落在雜訊內，所以**沒有更新 `riskref.js`**（沿用 5D 的做法）。
- **成人不變的驗證**（一次性）：用 `git archive HEAD` 複本與 HEAD＋6A 檔案複本，各自從同一批 18 歲的存檔（38 段）續玩到死亡，事件與標題順序、亂數終態、數值、旗標、死因逐項相同（38／38）；12 歲的存檔（39 段）則依預期不同（青少年的選項改了）。
- **人工閱讀**：用 `tools/read-life.mjs` 的 `playLife`（與一個小包裝腳本）讀了 10 段童年：貧窮鄉下奈及利亞、尼日、單親奈及利亞、孤兒（印度、奈及利亞，叔叔、姑姑、阿姨、舅舅、伯父出面決定）、烏克蘭 2022 年的 10 歲孩子、戰亂後重新安置到德國的烏克蘭孩子、敘利亞城市的孩子等，另用 `fam.mjs` 篩出家人決定的紀錄逐條核對雙親存歿與用字。讀出並修掉：成人口吻的 `variants`（「不知道該不該出門」）、營地登記表「你不確定該如何填寫」、「奶奶請了半天假」、母親決定卻寫成「塞進他手裡」、孩子不上學卻出現「放學後」「功課」。
- **驗證**：`tests/agency.test.mjs` 16 項全過；`node tools/agency-scan.mjs 1500 --static` 零旗標；`coherence-scan.mjs 1500 --stress --novelty` 沒有 `agency` 旗標。`npm test` 238 項中 229 通過；9 項失敗全部來自 6B 進行中的檔案與規則（`household` 規則、`migration_*` 事件文字取不到伴侶／孩子、`family_child_leaves` 變體、生平文字）。
- **已知限制／交給 6C**：(1) `household` 規則抓到 6A 擁有的檔案中的同住用語：`regional_culture_pilgrimage`、`regional_festival`、`world_pandemic_work`、`world_energy_prices_2022`、`seed_child_school_choice`、`health_disability_adaptation`、`health_clinic_far`、`health_flu_season`（獨自在異地卻寫家人在身邊）；(2) `world_ukraine_2022_home` 選了「留在原地」後，後續事件 `world_ukraine_later` 仍寫成臨時住所與學新語言；(3) 家人決定的結果沒有記成回憶（6C 的 `h.remember`）；(4) 同一年同時有兩個家人決定的事件時，用 salt 區分的「誰決定」可能是不同的人；(5) 沒有跟著家人決定存放「家人當時怎麼說」的旗標，之後的事件讀不到；(6) `sw.js` 快取版本沒動（沒有新增被快取的檔案）。
- **其他**：`coherence.test.mjs` 的 `renderAll` 加了一行 `cond` 過濾（成人不再被拿去讀青少年的選項）；`tools/agency-scan.mjs` 是新工具。
- **新測試**（`tests/agency.test.mjs`，16 項）：分級邊界、定義驗證、孩子沒有任何家人決定事件的卡片且紀錄為一般事件（500 段人生）、雨季熱的三種身分（孩子被家人帶、青少年請家人帶、成人原樣）、家境係數方向（富裕家庭帶去驗血的比例高於貧窮家庭，各 1500 段）、同種子可重現且手動逐年與自動一致、**成人不變**（60 段人生在 12 或 18 歲存檔，去掉所有 `decider` 後續玩到死亡逐位元組相同）、稽核規則的正反例、靜態稽核零旗標、1500 段人生零個大人決定、家人結果依雙親存歿點名、`whoDecides`、事件原文不叫孩子做決定、青少年至少有兩個選項且看不到家人專屬選項。

## Phase 6B notes（階段 6B：誰跟誰住在一起）

起因：「獨自到國外工作，為什麼還有父母和小孩照顧事件？」引擎只記「現在在哪個國家」，不記「誰在身邊」，所以接送、哄睡、半夜抱著孩子這類同住事件，不管人在哪裡都會發生。

- **模型**（`state.household`，`systems.js` 的 `ensureHousehold` 懶初始化，不改 `life.js`，舊存檔載入時依 `children`、`partner`、`country` 推導）：`parents`（與父母同住）、`partner`（與伴侶同住，已婚也可能分居）、`kids[i]`（`with_you | with_partner | with_grandparents | home_country | independent`）、`far[i]`（已獨立的孩子在國外）、`aloneAbroad`（在國外且沒有任何家人同住）、`joint`（大家庭）、`sep`（上次搬家丟下了誰、從哪一年）與敘事用的 `lastDepart / lastReunion / lastLeft / movedIn`。**所有決定都不抽亂數**（用 `stableFlip` 或純規則），所以沒有移民、離婚的人生，亂數序列與修改前完全相同。
- **維護的時間點**：離家（依出生地區的常態：北美、大洋洲 20 歲，歐洲 22，東亞、拉美、南亞 25，中東 26，±3 年）、結婚（大家庭地區與男方父母同住）、生子（先生在外工作時嬰兒與母親同住）、孩子長大離家（離家前後有 `family_child_leaves`／`aging_empty_nest` 兩個由系統排程的敘述事件）、離婚（一次決定所有未成年孩子的監護，並排程 `family_custody`）、喪偶（孩子回到身邊，或在你人在國外時去祖父母、親戚家）、父母過世（最後一位過世後沒有人可以同住）、年老父母搬來同住（依區域與收入，每人一次，或選了 `caregiver_parent` 當下就搬）、移民與回國。分居的夫妻生育率 ×0.4、離婚風險 ×1.35。
- **誰跟著去**（`h.migrate(code, { with })`）：`alone`（勞務、留學、公司外派單身）：誰都不帶，未成年孩子留給伴侶，沒有伴侶就留給祖父母或親戚；`partner`；`family`（技術移民簽證、公司外派帶家人、抽籤簽證、家庭團聚；同時是重聚）；`refugee`（現在同住的人都一起走，包括同住的父母；先送出去的家人在抵達後會被接上）；`keep`（二次搬遷）。沒指定時由 `autoMigrationMode` 決定（流離者為難民、留學生獨自、低收入與中低收入國家的移民獨自，12% 帶家人，其他約半數帶家人）。回國就是 `returnHome`，家人重新住在一起。第二年起分居的家庭有機會團聚（`migration_family_joins`，波灣國家很少，非正規居留與難民不會）。
- **新 helper**（`helpers.js`，現共 176 個，文件在 `js/engine/README.md` 第 9 節）：`livesWith`、`apartFrom`、`aloneAbroad`、`childrenWithYou`、`minorsWithYou`、`caregiverOfChildren`、`childrenApart`、`childrenNearby`、`parentsNear / parentsFar`、`coupleApart`、`livesAlone`、`leftBehindLine`、`lastLeftChildName`、`household`、`childLives`，以及會改狀態的 `reunite`、`moveParentsIn`、`cohabit`、`setChildrenLive`、`childLeaves`、`moveInWithChild`、`sendFamilyAway`；`h.migrate` 多了第二個參數。
- **事件**：`adult_family`、`adult_work`、`aging`、`migration`、`yearly` 裡每一個同住場景都加了條件或分支（接送、半夜發燒、家庭聚餐、孩子叛逆、同住的公婆、婚禮的父母、「家人在門口擦身而過」等）；同一個事件對獨居的人改寫成視訊、電話、匯款或回憶。新增「留在後面的人」的瞬間：`migration_apart_first_year`（第一年）、`migration_missed_birthday`（生日在視訊裡錯過）、`migration_school_fees_remit`（匯款付學費）、`migration_parent_far_illness`（爸媽住院，人在遠方）、`migration_couple_apart_choice`（夫妻分隔數年後的抉擇）、`migration_return_reunion`（回國後孩子認不得你，或孩子比你記得的高了一截）；`family_visiting_parent`（探望老家的父母）；`migration_family_joins` 重寫成「接家人來」並更新同住狀態；`family_child_leaves` 同時是一般事件（變體要求）。
- **稽核規則 `household`**（`tests/lib/rules-household.mjs`，在 `coherence.mjs` 以一行註冊；`coherence-scan.mjs` 新增 `--migrant`，讓每一段人生都是勞務／留學／難民移民，並用不同的家庭組成輪流）：嚴格詞（餵、哄睡、接送、揹著孩子、同住）與同處詞（陪著、牽著、抱著、一起吃飯、面對面）對上不同住的孩子、伴侶、父母；獨自在異地時，「家人、全家」的場景也算。放行：視訊、電話、匯款、探望、放假回家、回憶與願望、儀式、否定句、別人的孩子。
- **掃描前後**（3000 段人生，同一組種子，修改前＝HEAD 的五個檔案＋現在的引擎）：

  | 掃描 | 修改前 `household` 旗標 | 修改後 |
  | --- | --- | --- |
  | 自然人生 `3000 hh6b-nat` | 258 | 0（6A 檔案的 13 個事件列入 `rare` 允許清單，見下） |
  | `--migrant --novelty` | 988 | 0（其餘 3 筆：`phone` 1、`density` 1、`dup_event` 1，皆非 `household`） |
  | `--stress --novelty` | — | 0（另有 6A 的 `school` 2、`density` 4） |

  `sys:重返職場` 的重複（同一個人二度回職場）順手加了第二種寫法。
- **人工閱讀**：用 `tools/read-life.mjs` 與腳本讀完整人生 8 段（勞務移民、留學、難民、外派、離婚與監護、年老父母搬進來等不同路線），並用一個合成狀態對比 HEAD 與現在的事件：單身赴卡達的尼泊爾工人，HEAD 仍會收到「Anita Joshi 半夜發燒，你按著醫生教過的步驟」「校車、課後班」「Sunita Sherpa 的家人習慣不敲門就進來」；現在只剩視訊中錯過的生日、匯款付學費、爸媽住院卻回不去。
- **校準**：沒有碰死亡風險。在複本跑 `node tools/calibrate-risk.mjs 30000 1`，與現行 `riskref.js` 相比中位數變動 1.25%、p90 9.6%（稀疏的老年格子，屬抽樣雜訊），所以**沒有覆蓋 `riskref.js`**（6A 仍在改內容）；6C 在 6A 結束後統一重跑 `30000 4`。
- **驗證**：`tests/household.test.mjs` 31 項（狀態轉換、單獨移民絕不收到同住照顧事件、團聚、舊存檔、規則本身）；`npm test` 238 項全過；`node tests/e2e.mjs` 83 項、零 console 錯誤。審計測試在其他程序同時跑時會超過 60 秒預算（獨自跑約 46 秒），要單獨跑。
- **順手修的非我擁有的檔案**：`eulogy.js`（有難民路線時，即使超過字數預算也要交代路線）與 `eulogy.test.mjs`（`成了家` 的正規式）；`tests/e2e.mjs` 的時間軸寬度容差由 2 改成 3（長條有左右各 1px 的邊框，剛好差 2px，只有碰巧有極窄片段的人生才會過）。
- **交給 6C 的問題（6A 擁有的檔案）**：`world_pandemic_work`、`world_energy_prices_2022`、`health_alcohol_problem`、`health_miscarriage`、`health_disability_adaptation`、`health_flu_season`、`health_clinic_far`、`seed_child_school_choice`、`regional_culture_pilgrimage`、`regional_festival`、`regional_remittance_day`、`regional_bed_nets`、`regional_wildfire_season` 仍會把家人放在獨居者的房間裡（目前用 `coherence.mjs` 裡一筆 `rare: true` 的允許清單放行，修好後請刪掉）；`regional_wildfire_season` 的孩子變體有 1993 年的「手機」（`phone` 規則，1 筆）；`variants.js` 的 `kid()` 以年齡挑孩子，不知道孩子住在哪裡（我用事件條件擋掉）；`childhood_parent_abroad` 只看國家不看 `household`；`getStatus` 沒有同住資訊；`climate/world_hurricane_mitch_1998` 的允許清單項目已過時（掃描報告 stale）。
- **剩下的問題**：`sw.js` 的 `CACHE_VERSION` 未更動，部署前需要升一版。

## Phase 6C notes（階段 6C：前後關聯）

起因：「事件應該要有前後關連」。6C 先量（後果追蹤器），再補（記憶系統、缺的後續事件與旗標），最後把 6A／6B 留下的問題收乾淨。

- **後果追蹤器**（`tools/consequence-scan.mjs`、`tests/consequence.test.mjs`）：`events.js` 裡的 `TRACE` 掛鉤（遊戲中為 `null`）加上 `s.flags` 的 `Proxy`，記錄每個重大選擇設下的旗標、排入的後續事件，以及之後有誰在 `text` 或 `cond` 讀到這些旗標；動態分析玩 N 段人生，判斷「這個選擇之後有沒有看得見的回響」，管道有 followup／text／cond／memory／eulogy 五種。「distinct」不算所有選項共用的旗標或後續。靜態分析把 1 個選擇分成 follow-up／flag-read／engine-read／weight-only／guard-only／none；`--blind` 列出「各選項都排了同一個後續、卻沒有任何旗標分得出你選了哪個」的事件（Ukraine 就是這種）。
- **覆蓋率**（加權＝依選擇出現的次數；2000 段人生）：6C 之前 **17.1%**（只有 24.5% 的選擇有任何讀者或後續，54% 什麼都沒有）；補後續、旗標讀者與回憶之後 **51%**（strict 48%；25 年以上還有時間回響的 56%）。**沒有達到最初的 80%**：80% 需要一生約 20 次回想，讀起來像口頭禪（試過，約 83.6%）。依協調者的決定把密度壓到「一生約 3–4 次回想、6–8 句呼應」、而且只說寫過的句子，所以這個數字是誠實的量測值，測試門檻設成量測值減幾個百分點（any ≥ 47%、strict ≥ 44%、長視野 ≥ 52%），沒有灌水。要再提高，路是補後續事件與旗標讀者（`--top=40` 列出最常出現卻沒回響的選擇：`seed_health_scare`、`family_housework_split`、`seed_disaster`…），不是多說幾句。
- **記憶系統**（`js/engine/memory.js`，不用任何亂數，全部是 `hash01(seed|age|key)`）：`state.memories = [{k,p,a,g,t?,w?,n?,l?,u?,s?}]`，上限 48，純 JSON。鍵：`c:` 選擇、`f:` 家人替你做的決定、`e:` 事件、`loss:` `love:` `kid:` `move:` `work:` 系統時刻；`p` 是第二人稱過去式的子句，接在「你想起{十歲那年}，」後面；`u` 標示「面對「…」，你選了「…」」這種機械的紀錄句（留給追蹤器，**不說出口**：不進回想、呼應、`h.recall`、紀念句與回憶清單）；`s` 標示該選擇已有自己的後續（回想時其他記憶先）。寫入來源：`events.js`（選擇的 `memory`／`memoryYou`、事件的 `memory`、家人決定自動記「誰拿了主意」）、`systems.js`（第一份工作、結婚、離婚、生子、遷居、三種失去）、事件裡的 `h.remember`。說出口：`reflection(s)` 取代一個平凡的一年（間隔至少 6 年，一生約 3–4 次）、`echoFor(s, ev, domain)` 附在同類事件下面的一行斜體（`.entry-echo`，一生約 6–8 次；強配對＝共同的具體標籤，弱配對＝家庭、健康、工作、愛情、遷徙同領域；回顧型事件任何記憶都合適）、`h.recall`／`parentRecall`（父母過世時叫回他當年替你做的決定）、`aging_widowed_first_year`（叫回婚禮）、告別（紀念句）。**從不**說出口於悲傷、戰爭、災難、死亡標籤、一般里程碑、後續事件。同一則記憶說過後休息 10 年（`FRESH_AFTER`，`h.recall` 也守這條），同一年不重複。「誰決定」現在每個人生階段固定（`agencyOf(age)`），不再依年份或事件換人。
- **521 句寫好的記憶**（`js/data/events/memories.js`，188 個事件；最後一輪替最常觸發卻只有機械句的 110 個選擇補了句子），20 個家人決定的事件各有自己的「誰做主」句。最終狀態下留著機械句的選擇記憶約 10%（原本 24%），它們只記錄、不說出口。
- **例子**（真實人生，`tools/read-life.mjs`）：
  1. 36 歲，烏克蘭基輔的 Timofey：「父親過世：…你想起四歲那年，爸爸決定留在家鄉，警報響起時一遍遍告訴你「我們在一起」。」（四歲時家人替他做的決定，在父親過世時叫回來）
  2. 52 歲，菲律賓納卯的 Gina：「一個人的餐桌：…夜裡你想起二十三歲那年，你和 Manuel Villanueva 結了婚。」
  3. 晚年的 Timofey：「你不由得想起三十八歲那年，胸口悶痛時，你告訴自己只是累了，等了一陣子。」（又一次胸口悶痛）
  4. 63 歲的平凡一年（Serkan，德國）：「一個尋常的傍晚，你想起前年，你的父親過世了；再往前，是六十歲那年，還想去的地方，你只留在心裡，在家看看照片和地圖。」
- **遺言**（`eulogy.js`）：`keepsakeOf` 挑一個家人決定、失去或寫好的記憶，轉成第三人稱，放在家庭句（兒童則在階段句）裡，太長時第一個被拿掉；自殺、數字或引號、孩子的失去、沒有孩子／伴侶卻提到的都排除。
- **跨檔修正**：6A 的 13 個同住用語事件改好並移除 `rare` 允許清單；1993 野火的電話；`kid()` 看住戶（孩子不同住就不再「孩子叫你」）；`childhood_parent_abroad` 用住戶；清掉過期的 `world_hurricane_mitch_1998` 項目（標題改成「米契帶來的大雨」）；Ukraine「留下」的後續不再說離開了（新旗標 `u_left`／`u_stayed`／`u_relatives`，`world_ukraine_later` 依旗標分三種寫法）；追蹤器 `--blind` 找到的其他不一致：長輩走路輔具、談心願、離婚前的諮商與分居、診所與手術、朋友來電等都加了旗標與讀者。此外最後驗證時順手修了三個冒出來的真問題：`aging_empty_nest`（離家的孩子在後續出現前過世）、`migration_return_reunion`（同上）、`regional_conflict_displacement`（單獨在異國的人坐在家人的桌子旁）、`family_adult_child_money`（電話裡的「陪孩子」）。
- **介面**：家人抽屜每位家人旁有一個「同住／分開住／在家鄉／在國外／跟伴侶／跟另一半的家人／跟祖父母／已獨立」小標籤（`getStatus(s).household`、`strings.js people.where`），底下有「回憶」清單（最近五則，不含機械句）；呼應那行用斜體加 `↺` 記號（`aria-hidden`）；`pacing.js` 的閱讀時間算進呼應的字數。截圖 `mobile-light-06-family-drawer.png` 已看過：標籤與回憶排版正常。
- **重活的根因**（「一次重活中途重新載入仍是重活」）：不是計時，是種子。網址固定 `?seed=` 時，每一次重活都用同一個種子，在負載重時（CPU 排隊、自動選擇走到不同年份）重活又在 0 歲死掉一次，測試看到「死亡畫面」而不是「重活中」；8 次負載下重現 7 次。修在 `storage.startSeed(pinned, replay, fresh)`：重活使用 `seed~n`（n 為重活次數），固定種子的第一次仍是原種子。修好的人生活了 58 年；測試沒有放寬。
- **測試速度**：`tests/lib/scale.mjs`（`QUICK`、`scaled(full, quick, min)`；環境變數 `LL_QUICK`、`LL_SCALE`）、`tools/run-tests.mjs`（`--quick`、`--scale=K`）、`npm run test:quick`。模擬測試改成 worker threads（`tests/lib/sim-pool.mjs`、`sim-worker.mjs`），`calibrate-risk.mjs` 同樣用 worker（相同種子、相同結果）。`npm test` 完整：約 11 分鐘 → 8 分 11 秒；`test:quick`：3 分 58 秒（**沒有達到 3 分鐘**：剩下的時間是固定大小的聚焦、新鮮度、遺言測試與統計性的模擬，再砍就會讓 ±2.5 歲的壽命檢查常常誤報——600 段人生時 NGA 就誤報過一次）。快速模式只抽 4 個國家、各 1000 段人生，健康聚焦壽命差（0.5–3.2 年）只在完整版斷言。覆蓋審計的時間預算由「60 秒」改成「每段人生 0.07 秒」（完整版實測 0.042 秒，1300 段約 55 秒，離 60 秒太近）。
- **PWA**：`sw.js` `CACHE_VERSION` v11→v12，預先快取 `memory.js`、`memories.js`；`index.html` 的 modulepreload 重新產生（62 個）。
- **校準**：`node tools/calibrate-risk.mjs 30000 4`：12 分 41 秒（48 分鐘 CPU，4 個 worker），四輪最差 |mean−1| = 0.425 → 0.297 → 0.366 → 0.263。與現行 `riskref.js` 相比：600 格，中位數變動 1.25%、p90 10.4%、最大 51.9%（都是稀疏的老年格，抽樣雜訊，與 6B 的中位數 1.25% 相同）。**沒有覆蓋** `riskref.js`（還原為 HEAD），模擬測試在原檔上全過。
- **驗證（最終狀態）**：`npm test` 260 項全過（8 分 11 秒）；`node tests/e2e.mjs` 83 項（含新的呼應行、抽屜標籤、回憶清單斷言）、零 console 錯誤；`e2e-pacing.mjs` 17 項（短節奏的整生 10.70 分鐘＝104.5%，標準 38.61 分鐘＝105.0%，在 ±15% 內，呼應行的字數已計入）；`e2e-eulogy.mjs` 20 項；`a11y.mjs` 80 個畫面零違規；`coherence-scan.mjs 3000 p6c`：自然 0 個內容旗標（`density` 2）、`--stress --novelty` 0（`density` 1）、`--migrant --novelty` 0。讀了 10 段人生（7 段活了 69–92 歲，3 段在 2、11、12 歲夭折）：呼應與回想大多自然，已修掉讀到的兩句缺脈絡的記憶句。
- **剩下的問題**：(1) 覆蓋率 51%，不是 80%（原因與下一步見上）；(2) `test:quick` 約 4 分鐘；(3) 長壽的人生（80 歲以上）平均 4.4 次回想與 9.4 句呼應，比平均人生多；(4) `density`（一年 5 筆）仍偶爾出現，是引擎層級、已列入預算；(5) `riskref.js` 沒有重新校準（見上）。

## 階段 7：家族名冊（手足、配偶、父母、姻親逐人記錄）

### 7.0 現況與問題

- **手足**：只記一個數字 `family.siblings`，全在出生時就存在，沒有名字、性別、長幼，也沒有生死，所以已過世的兄弟姊妹仍可能以現在式出現。之後出生的弟妹也不存在。
- **父母**：有名字、年齡、存歿，但沒有記錄何時、因何過世，也沒有健康狀況或居住地的細節。
- **配偶／伴侶**：只有一個 `partner` 物件。再婚後前任的資料被覆蓋，前任的名字可能被誤用。伴侶的死因與年份也沒有保存。
- **姻親（伴侶的父母）**：只依年齡粗估是否在世，沒有名字，也不會過世。

### 7.1 目標

每位家人都是一個「人」：有名字、性別、出生年、存歿、死亡年份與死因、居住地，並依各國生命表逐年判定生死。事件、回憶、生平與介面都依名冊說話；一致性稽核以名冊驗證每一句話。

### 7.2 7A 引擎：家族名冊（先做，其他代理等它完成）

- **新模組** `js/engine/kin.js`，狀態為 `s.kin`：
  - `siblings: [{ id, name, gender, birthYear, older, alive, deathYear, cause, where, married, kids }]`
    - 出生時依原本的手足數，在哥哥、姊姊、弟弟、妹妹之間分配長幼。
    - 之後出生的弟妹依母親年齡與該國生育率逐年加入，只在母親在世時發生。
  - 父母沿用 `family.mother`、`family.father` 的位置，補上 `birthYear`、`deathYear`、`cause`、`where`。
  - `partners: [{ id, name, gender, birthYear, status, since, until, alive, deathYear, cause }]`
    - 保存歷任伴侶，`status` 可以是 dating、married、divorced、widowed、ended。
    - `s.partner` 仍指向現任，維持相容。
  - `inLaws`：現任伴侶的父母，有名字（依伴侶的文化群）、存歿與死亡年份。結婚時建立；離婚或喪偶後保留在該任伴侶底下。
- **逐年生死**：所有家人都用同一套生命表（國家、年代、性別、年齡）判定。
  - 使用由種子衍生的獨立亂數流，不消耗主角的亂數。
  - 主角的人生事件因此不變，只有和家人生死相關的文字會不同。
  - 校準不受影響。
- **家人過世時**：
  - 產生系統行與回憶，例如「哥哥 X 在 52 歲那年因中風過世」。
  - 用簡短的哀傷效果更新幸福與人際；同一年多位家人過世時合併成一條。
- **helper**：
  - 手足：`h.siblings()`、`h.livingSiblings()`、`h.sibling({ older, gender, alive })`、`h.siblingName(sel)`、`h.siblingWord(sel)`（依長幼與性別回傳哥哥、姊姊、弟弟、妹妹）、`h.hasLivingSibling(sel)`。
  - 伴侶：`h.exPartners()`、`h.lastPartner()`。
  - 姻親：`h.inLaw('mother'|'father')`、`h.inLawsAlive()`。
  - 父母：`h.parentDiedAt(who)`。
  - 全部寫進 `js/engine/README.md`。
- **舊存檔相容**：沒有 `kin` 時，依現有的數字、名字與存歿，用不消耗亂數的方式推導出名冊。
- **重活**：`birthOf` 要包含出生時的手足名冊，重活時沿用。
- **摘要**：`getStatus`、`getSummary` 加入名冊，供介面與生平使用。
- **測試** `tests/kin.test.mjs` 要涵蓋：
  - 手足生死率符合生命表。
  - 弟妹只在母親在世且年齡合理時出生。
  - 再婚後保留前任。
  - 姻親會過世。
  - 主角的亂數流不受影響：同一種子下，主角的事件序列與舊版一致。
  - 舊存檔可讀。

### 7.3 7B 內容與稽核（7A 完成後，與 7C 並行）

- **稽核規則**（新檔 `tests/lib/rules-kin.mjs`）：
  - 已過世的手足、伴侶、前任、姻親以現在式出現。
  - 稱謂與長幼、性別不符：沒有哥哥卻寫哥哥；弟弟其實比你大。
  - 寫「兩個妹妹」，實際人數不符。
  - 再婚後用了前任的名字指稱現任。
  - 提到公婆或岳父母，但沒有伴侶，或對方的父母已過世。
- **內容改寫**：所有提到手足、兄弟姊妹、公婆的事件都依名冊說話，用真實的名字與稱謂。
- **新增事件**（約 20–30 則，涵蓋各所得組別與地區）：
  - 手足：結婚、移居、病倒、過世、手足間的照顧與爭執、替手足照顧孩子、分家產。
  - 姻親：見面、相處、照顧、過世。
  - 前任：多年後再遇見前任。
- **回憶與生平**：手足、姻親過世寫入回憶。生平在合適時提到手足，例如「與三個手足一起長大，最後送走了姊姊」。
- **擁有的檔案**：`js/data/events/*`、`js/data/yearly.js`、`js/engine/eulogy.js`、`js/engine/memory.js`、`tests/lib/*`、`tests/coherence.test.mjs`、`tools/coherence-scan.mjs`。

### 7.4 7C 介面（7A 完成後，與 7B 並行）

- **家人面板**：分成父母、手足、伴侶（含前任）、子女、姻親幾組。
  - 每人顯示名字、稱謂、年齡或享年、住在哪裡、存歿；已過世者用柔和的樣式並標出年份。
- **回顧頁**：新增簡潔的「家族樹」區塊，以 SVG 或卡片呈現，手機可讀，深淺色都要正確，並通過無障礙檢查。
- **擁有的檔案**：`js/ui/**`、`css/**`、`js/strings.js`、`sw.js`、`tests/e2e*.mjs`、`tests/a11y.mjs`。

### 7.5 共通規則

- 全部完成後依序執行，都必須通過：
  - `npm test`
  - `node tests/e2e.mjs`、`tests/e2e-pacing.mjs`、`tests/e2e-eulogy.mjs`、`tests/a11y.mjs`
  - 三種模式的 `coherence-scan`，3000 段人生
- 家人過世的系統行會增加閱讀量，要留意 10 分鐘人生的節奏。

## Phase 7A notes（階段 7A：家族名冊）

新模組 `js/engine/kin.js`、狀態 `s.kin`、文件在 `js/engine/README.md` 第 12 節（API 與欄位以那一節為準）、測試 `tests/kin.test.mjs`（29 項）、工具 `tools/kin-determinism.mjs`。`npm test` 289 項全過（原 260 項＋29 項）、`node tests/e2e.mjs` 83 項零 console 錯誤、`e2e-pacing` 17 項、`e2e-eulogy` 20 項、`a11y` 80 個畫面零違規。

### 做了什麼

- **手足逐人記錄**：`kin.siblings`（已出生，含已過世者）、`kin.coming`（尚未出生的弟妹）、`kin.birthRoster`（出生時規劃的名冊，`birthOf` 交給重活）。每人有 `id name given gender birthYear older alive deathYear deathAge cause where married kids`。名字來自家庭的文化群與家姓（沿用 `names.js` 的規則，父名制與音節制照 `childFamilyToken`），家中不重名。
- **長幼與弟妹出生**：出生抽到的手足數 N（`family.siblings`，抽法完全不動）是**一生的總數**。依母親年齡與該國 TFR（生育間隔約 2–3.4 年、第一胎約 22 歲且不早於 16 歲、最後一胎不晚於 44 歲）分成哥哥姊姊（已出生）與弟弟妹妹（`coming`）。弟妹在出生年加入，**母親當年已過世或超過 45 歲就取消**。母親出生時已不在，則全是年長手足。
- **父母**：仍用 `systems.js agePeople` 的舊邏輯與 `state.rng`，只補欄位 `birthYear deathYear deathAge cause where`（死因另用名冊自己的雜湊流抽）。**選的是你偏好的方案**：不搬動，所以主角的亂數序列與舊版完全相同；原本的「母親過世」「父親過世」系統行與回憶不變。
- **伴侶歷史**：`kin.partners`，`status` 為 `dating | married | divorced | widowed | ended`；`s.partner` 仍是現任（離婚或喪偶後仍指向那一位，直到下一位取代）。`syncPartner(s)` 讓歷史跟著 `s.partner`，在 `newPartner / setPartner / marry / divorce / endRelationship`、`love()` 的初識與分手、`agePeople` 的喪偶各處呼叫，每年也跑一次，所以手動改過的狀態下次讀取時會被修正。現任（dating / married）的死亡仍由舊邏輯決定；前任的生死由名冊決定，不寫進日誌。
- **姻親**：第一次結婚時建立兩位（`rel: mother | father`），名字依**伴侶**的文化群，出生年在伴侶之前 17–44 年，結婚當下是否在世依生命表（約四分之一在婚禮前已過世），之後逐年判定。離婚後留在前任名下，喪偶後仍是你的姻親。`partnerParentsGone()`（婚禮文字）改讀名冊。
- **逐年生死**：手足、姻親、前任都用同一套生命表（國家、出生年、性別、年齡；五歲以下加上家境與城鄉的同一組係數，平均為 1），死因用 `causes.js` 的同一張表。
- **系統行**：一年內的手足與姻親過世合併成**一條** `kind: 'kin'` 的日誌（標題 `哥哥過世`、`岳母過世`，多人則 `親人過世`），附小幅哀傷（手足：幸福 −3 到 −4、人際 −1；姻親：幸福 −1；合計上限 −8／−3），一則安靜的回憶（`loss:sib:<id>`、`loss:inlaw:<id>`）與手足的重要時刻（「哥哥志明離世。」）。只有現任（結婚或喪偶）伴侶的姻親會寫進日誌。
- **舊存檔**：`deserialize` 呼叫 `ensureKin`，只用現有的數字、名字、日誌（父母過世的年份）與 `s.partner`（`flags._married` 判斷是否結過婚）推導，再把已活過的每一年用同一個雜湊流無聲地重播；不碰 `state.rng`；結果與一條從頭活下來的人生完全相同（測試逐人比對）。舊存檔只知道**現任**伴侶（更早的在 7A 之前就被覆蓋了）。
- **重活**：`birthOf(s).kin = { siblings: [{ name, given, gender, birthYear }] }`，`normalizeBirth` 用 `cleanBirthKin` 驗證，`storage.js cleanStart` 保留。沒有 `kin` 的舊紀錄就依數字規劃。
- **摘要與儲存**：`getStatus(s).kin`（`kinView`）、`getSummary(s).kin`（`kinSummary`）；`storage.js normalizeSummary` 以 `cleanKinSummary` 保留（手足 ≤14、伴侶 ≤8、姻親 ≤16，字串截長），舊紀錄沒有 `kin`。

### 三個要特別說明的決定

1. **「獨立的亂數流」＝雜湊流，不是另一個狀態陣列。** 名冊的每個機率都是 `hash01(seed + 用途 + 人 + 年)`（和 `memory.js`、`stableFlip` 同一種做法），不消耗也不讀取 `state.rng`，與其他抽籤的次數與順序無關，所以舊存檔可以無亂數地重建，`syncPartner` 也能在任何時候安全呼叫。
2. **`h.siblings()` 的意義改了。** 規格要它回傳名冊，但既有 42 處事件條件和文字把它當**數字**用（`h.siblings() > 1`）。為了不動主角的序列，舊數字改名為 `h.siblingsAtBirth()`（回傳 `family.siblings`，永遠不變），既有事件檔（`js/data/events/*.js`）逐字機械式改名（只改這個呼叫）；`h.siblings()` 現在回傳名冊陣列。7B 改寫內容時要把 `siblingsAtBirth()` 逐一換成名冊 helper。
3. **哀傷是唯一會回頭影響主角的地方。** 狀態會影響事件條件，所以幸福 −3 可能讓之後某個事件的資格或權重不同。實測見下表；`KIN_TUNING.grief = false` 可完全關掉。另外兩個潛在管道都已封死：日誌行寫在**年末**（`kinAnnounce`，`life.js` 在 `runEvents` 之後呼叫），不會佔用當年的條目額度，也不會取代「平凡的一年」的抽籤（安靜的一年，平凡的一行被這一條取代；當年已有四條時，消息最多晚兩年再說，實測 3155 次裡有 4 次晚）；回憶是 `quiet`（`remember(..., { quiet: true })`），不會被回想或呼應選中、也不佔 48 則的上限（自己的上限 16），因為「回想」會改變 `pickYearly` 是否抽一個數字，等於移動亂數流。

### 實測

3000–4000 段人生，自動遊玩。

**手足數（出生抽到的數字不變，所以「之前」就是抽到的 N）**

| | 平均 | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 抽到的 N（之前） | 2.522 | 20.0% | 21.1% | 17.3% | 14.3% | 9.3% | 6.7% | 11.5% |
| 名冊規劃的總數 | 2.522 | 20.0% | 21.1% | 17.2% | 14.3% | 9.3% | 6.7% | 11.5% |
| 其中出生時已出生（哥哥姊姊） | 1.313 | | | | | | | |
| 其中之後才出生（弟妹，規劃） | 1.209 | | | | | | | |
| 活到終點時：已出生＋尚未出生 | 2.498 | | | | | | | |

放不進去的手足不到 0.1%；因母親先過世而取消的弟妹 2.0%（97／4837）；主角先過世而沒出生的 536 人不算損失。家庭大小沒有膨脹。

**手足死亡率（每人每年，對照生命表）**

| 年齡 | 0–4 | 5–14 | 15–39 | 40–59 | 60–79 | 80+ |
| --- | --- | --- | --- | --- | --- | --- |
| 觀察死亡數／生命表期望 | 432／417 | 213／229 | 706／684 | 969／972 | 1609／1633 | 611／598 |
| 比值 | 1.04 | 0.93 | 1.03 | 1.00 | 0.99 | 1.02 |

**比所有手足都晚走**：有手足的人中 29.4%（占全部人 23.2%；多數在 80 歲以上過世）。**日誌**：平均每人 2.1 條 `kin` 行，78% 的人至少有一條，同年合併 198 人，最多一人 13 條（11 個手足）。**姻親**：每次結婚 2.00 位，婚禮前已過世 24.4%，婚後過世 66.0%，主角過世時兩位都已不在 85.7%。**伴侶**：平均每人 1.16 位，離婚 1014 位、喪偶 1406 位（4000 人）。

**決定性比較**（`git archive HEAD` 的複本 vs 這一版，`node tools/kin-determinism.mjs --base=… --n=200`，過去／現在／未來／隨機四種年代輪替，自動選擇；比較每條日誌的年齡、種類、標題（選擇則是選的選項）、死亡年齡與死因、**以及最後的 `state.rng`**）：

| 模式 | 一模一樣 | 其餘 |
| --- | --- | --- |
| 哀傷關閉 | 200／200 | — |
| 哀傷開啟（出貨設定） | 190／200 | 10 段在**第一條 kin 行之後**才分歧（0 段在之前） |

還有 `tests/kin.test.mjs` 在 repo 內做同樣的對照（名冊整個關掉 vs 開著，`KIN_TUNING.enabled`）。

**覆蓋率與校準**：`coherence-scan 1000 p7a`（自然、`--stress`、`--novelty`）旗標與 HEAD 完全相同（只剩既有的 `household` 1 筆）；`--migrant` 也與 HEAD 相同（既有的 `density` 1 筆）。有 4 條以上的年份由 0.10% 升為約 0.6%（一條 kin 行最多讓一年到 4 條，不會到 5 條）。校準：在複本跑 `node tools/calibrate-risk.mjs 30000 1`，與現行 `riskref.js` 相比中位數變動 1.27%、p90 10.6%（稀疏的老年格子，與 6B 當時的 1.25%／9.6% 同量級，屬抽樣雜訊），所以**沒有覆寫** `riskref.js`；主角的風險項只看健康、財富、病況，哀傷只動幸福與人際，沒有改到。

### 改到的既有檔案

- 引擎：`systems.js`（在上述各點呼叫 `syncPartner`／`kinParentDied`／`kinYear`；`partnerParentsGone` 讀名冊）、`life.js`（`initKin`、`birthOf().kin`、`deserialize` 呼叫 `ensureKin`、`getStatus().kin`、`kinAnnounce` 的兩個呼叫點）、`birth.js`（`normalizeBirth` 的 `kin`）、`summary.js`（`kin`）、`helpers.js`（16 個新 helper、`siblings()` 改名）、`memory.js`（`quiet` 選項與自己的上限）。
- 事件資料：`js/data/events/*.js` 只把 `h.siblings()` 改名為 `h.siblingsAtBirth()`（42 處，沒有改任何文字或條件）。
- 儲存：`storage.js`（`cleanStart` 保留 `kin`、`normalizeSummary` 保留 `kin`）。
- 7C 的檔案，但不得不動：`sw.js` 加入 `js/engine/kin.js` 並把 `CACHE_VERSION` 升為 `v13`；`index.html` 由 `node tools/build-preload.mjs` 重新產生。
- 測試：`events.test.mjs`（日誌種類加 `kin`）、`replay.test.mjs`（父母物件多了欄位，比對 `alive age name`）、`eulogy.test.mjs`（`calamity` 在快速模式的 800 段人生裡只有 6–9 段，下限改為 `scaled(8, 4, 4)`；完整模式仍是 8）。
- 工具：`tools/read-life.mjs`（結尾印出名冊）、新增 `tools/kin-determinism.mjs`。

### 給 7B（內容與稽核）

- **名冊 helper**（全部在 `js/engine/README.md` 第 12 節）：`h.siblings(sel?)`（已出生者，含已過世）、`h.livingSiblings()`、`h.sibling(sel)`、`h.hasLivingSibling(sel?)`、`h.siblingName(sel, { full }?)`、`h.siblingWord(sel)`（哥哥／姊姊／弟弟／妹妹）、`h.partners()`、`h.currentPartner()`、`h.exPartners()`、`h.lastPartner()`、`h.inLaw('mother'|'father')`、`h.inLawsAlive()`、`h.inLawWord(rel)`（岳父母／公婆）、`h.parentDiedAt(who)`、`h.kin()`。`sel` 是 `{ older, younger, gender, alive, id, name }`。
- **舊數字還在**：`h.siblingsAtBirth()` 與 `s.family.siblings` 是一生的總數，**包含已過世與還沒出生的**，文字不要再用它。稽核器 `snapshot()` 的 `siblings` 也是這個數字，`siblings_count`、`siblings` 兩條規則要改讀名冊（`s.kin.siblings` 的 `alive/older/gender`）。
- **目前內容與名冊矛盾的實例**（`tools/read-life.mjs --seed=rd7 --country=IND --gender=M --wealth=2`）：44 歲哥哥過世，隔年事件「兄弟姊妹聚在一起：你和兄弟姊妹窩在舊房間…」；沒有任何手足的人（`--seed=rd1 --country=TWN --gender=F`）仍在 62 歲讀到「弟妹來接手三天」；2 歲讀到「家裡多了一個小嬰兒」，名冊的弟妹出生年未必相符。
- **回想**：`KIN_TUNING.quietMemories = true`，手足與姻親的回憶只出現在家人面板、生平（`keepsake` 會挑 `loss:` 開頭者）與 `h.memories('family')`，不會被「平凡的一年」或事件呼應說出來。想讓它們被說出來，改成 `false`（或對單一回憶呼叫 `remember` 不帶 `quiet`），但那會移動亂數流（與舊版的逐段比較不再成立），要重跑校準與模擬測試。
- **日誌行的時間**：`kin` 行在年末、事件之後；它不佔 `maxEntriesPerYear`。要寫「手足過世」的事件，請用 `h.siblings({ alive: false })` 與 `deathYear`，不要自己再寫一條日誌；`h.recentLog('哥哥過世')` 之類以標題找也行（標題為 `${稱謂}過世`、`${岳父|岳母|公公|婆婆|伴侶的父親|伴侶的母親}過世`、`親人過世`）。
- **文字風格已固定**：第二人稱、短、不點出自殺（`cause: 'suicide'` 只在名冊裡）；有伴侶不同住時，姻親過世那條不會寫「陪著」「握著手」（`household` 稽核會抓）。新增的事件文字若提到 `inLaw(...)`，也要遵守。
- **規則建議**（`rules-kin.mjs`）：名冊現在能驗證「已過世者以現在式出現」（`deathYear`）、「稱謂與長幼性別不符」（`older`、`gender`）、「兩個妹妹」（`siblings({ gender:'F', younger:true, alive:true }).length`）、「再婚後用前任名字」（`partners()`）、「公婆／岳父母的存歿」（`inLaw(rel).alive`、無伴侶時為 `null`）。

### 給 7C（介面）

- **資料來源**：`getStatus(s).kin`（隨時都有；停用時為 `null`）：`{ siblings: [{ id, name, given, gender, birthYear, older, alive, deathYear, deathAge, cause, causeLabel, where, married, kids, word, age, ageNow }], coming, parents: { mother, father: { name, alive, age, birthYear, deathYear, cause, causeLabel, where } }, partners: [{ id, name, gender, birthYear, status, since, until, marriedYear, alive, deathYear, deathAge, cause, causeLabel, age, current }], inLaws: [{ id, rel, partnerId, name, given, gender, birthYear, alive, deathYear, deathAge, cause, causeLabel, word, age, current }] }`。`age` 是現在的年齡，已過世者是享年；`where` 是 `with_you | apart | home_country | abroad | ''`（手足可有 `abroad`；已過世為空字串）；`partners[].status` 是 `dating | married | divorced | widowed | ended`（`ended` 要有自己的字：分手，或婚前過世）；`current` 對伴侶是「現在這段關係」（dating／married），對姻親是「現任（結婚或喪偶）伴侶的父母」。`getStatus(s).siblings` 還是舊數字，面板請改用 `kin.siblings.length`。
- **回顧頁**：`getSummary(s).kin`（相同欄位的精簡版，沒有 `id`，姻親帶 `partnerName`）會存進相簿（`normalizeSummary`），**舊紀錄沒有 `kin`**，家族樹要處理 `undefined`。父母在 `kin.parents`。
- **新日誌種類**：`entry.kind === 'kin'`（有 `title`、`text`、`delta`），目前 UI 走「有標題的一般條目」分支，樣式類別 `kind-kin`；7C 可以給它一個比 `milestone` 更安靜的樣式。`pacing.js loadOf` 把它算進 `entries`（不是 `quiet`）。
- **建置**：新增模組時記得 `node tools/build-preload.mjs` 與 `sw.js` 的 `PRECACHE`（`pwa.test.mjs` 會檢查）；`CACHE_VERSION` 我已升到 `v13`。
- **注意**：名字可能是拉丁字母（`Hassani`、`Funmilayo`），句子裡沒有加空白，介面顯示名字時請用 `given`（句子用）與 `name`（全名）。
