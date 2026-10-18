# 美術素材與生成記錄

2026-10-18使用內建 **imagegen skill／image_gen** 生成。依使用者要求批次產出多套服裝，再以Pillow切分、加透明邊距及壓縮WebP；沒有以程式重畫角色。

## 最終素材

| 位置 | 內容 |
| --- | --- |
| `assets/town.webp` | 原創王國背景1536×1024 |
| `assets/outfits/{id}-{stage}.webp` | 20套服裝×4階段，共80張256×448透明角色 |
| `assets/wardrobe.css` | 服裝／年齡與素材映射 |
| `assets/wardrobe-manifest.json` | 每張素材的來源圖集、切分座標與尺寸 |
| `assets/wardrobe-catalog.webp` | 20套青春階段服裝一覽 |
| `assets/emblem.svg` | 原生SVG星形徽章，非AI生成 |

四階段代表童年10–11歲、初成長12–14歲、青春15–17歲、成年18歲。圖集分別以10／13／16／18歲作為代表外觀。服裝ID：daily、academy、travel、swim、gala、demon、maid、knight、mage、chef、healer、ranger、farmer、sailor、artist、scholar、dancer、winter、summer、festival。

泳裝是運動型完整泳衣，女僕服是高領長袖圍裙長裙，惡魔服是童話式長外套扮裝。均為原創、適齡、非性化設計。沒有使用原作角色、標誌、截圖或音樂。

每張圖集5欄（服裝）×4列（年齡）。第一批底列裁切不完整，已再用imagegen修正為完整人物；最終切分採用修正版。初期單人／三套圖集只作角色一致性參考，未放入最終遊戲。

## 可重現的切分

工具依賴：Python、Pillow、numpy、scipy（僅素材製作工具使用，遊戲執行不需要）。

```sh
python dream/tools/split_wardrobe.py atlas1.png atlas2.png atlas3.png atlas4.png
```

腳本依透明度找列間空隙，按五欄分割，使用連通區域排除鄰格碎片，保留人物透明度，再置於一致256×448畫布。成長階段保留不同高度上限，避免把童年與成年拉成相同身高。精確來源檔名及座標保存在manifest。

## 背景提示詞

```text
Use case: illustration-story. Asset type: wide background art for an original browser life-simulation game. A peaceful European fantasy hill town and cozy academy garden at spring golden hour, winding cobbled path, pale stone houses with terracotta roofs, distant castle, lush flowers, glowing motes. Hand-painted Japanese storybook RPG background, watercolor and gouache, sage greens, warm cream, dusty rose, honey sunlight. Wide3:2, no characters, logos, UI or writing, original world.
```

## 服裝圖集提示詞

### 第1組

```text
Use case: stylized-concept. Asset type: transparent character costume atlas for a wholesome fantasy parenting browser game. Produce a PORTRAIT atlas, exactly FIVE equal-width columns and FOUR equal-height rows, a strict 5-by-4 grid of TWENTY separate full-body character sprites. Each cell has one original brown-haired amber-eyed Lia, same identity as reference, centered FRONT-FACING NEUTRAL STANDING pose, hands by sides or gently clasped, no props. FOUR ROWS are age stages: row1 age10 child; row2 age13 early teen; row3 age16 teen; row4 age18 young adult. Natural gradual age proportions; entirely age appropriate and modest.
FIVE COLUMNS are outfits, repeat the SAME outfit design in every age row:
column1 DAILY: cream long-sleeve blouse, sage below-knee pinafore, brown boots, sage hair ribbon;
column2 ACADEMY: navy capelet, white shirt, dark teal below-knee skirt, tights, brown boots;
column3 TRAVEL: tan jacket, cream shirt, loose sage trousers, brown boots;
column4 SWIMMING: practical sporty blue long-sleeve rash guard swim top, modest blue swim shorts over full-length swim leggings, flat water shoes, no body emphasis;
column5 GALA: elegant burgundy full-length high-neck formal gown with long sleeves, subtle gold trim, dress shoes.
Each figure entirely contained within its cell with 10 percent transparent padding, no overlaps. Exact equal grid alignment for automatic cropping. No grid lines, labels, numbers, lettering, backdrop or cast shadow. Truly transparent background. Refined warm watercolor storybook Japanese RPG game art; clear silhouettes and detailed clothing. Maintain identity, do NOT copy composition from reference. Portrait canvas around 1536x2048 or higher; prioritize exact 5 columns x4 rows =20 characters over elaborate scenery. ALL twenty characters must be complete from head to shoes.
```

### 第2組

```text
Use case: stylized-concept. Asset type: transparent costume atlas. Create a portrait atlas of exactly TWENTY complete full-body sprites arranged in a perfectly aligned FIVE-column FOUR-row grid. All sprites are the SAME original brown-haired amber-eyed Lia from reference, front-facing neutral standing pose and no props. Rows1,2,3,4 show age10 child, age13 early teen, age16 teen, age18 young adult, natural age progression. Modest and age appropriate throughout.
Columns1-5 each represent a different costume, repeated consistently in all four age rows:
column1 DEMON FANTASY: modest dark plum long coat over black high-neck shirt, dark trousers, sturdy boots, small decorative curved horns and small bat wing accessories, no skin exposure, cute fairytale costume;
column2 MAID: classic modest Victorian maid costume, high-neck long-sleeve black full-length dress, white apron and small white headband, flat black shoes, dignified practical design;
column3 KNIGHT: light silver fantasy armor over dark padded long-sleeve tunic and trousers, no exposed skin, blue short cape, practical boots;
column4 MAGE: deep indigo full-length long-sleeve robe with small star embroidery, pointed wizard hat, closed shoes;
column5 CHEF: cream chef jacket with full sleeves, brown apron, chef hat, dark trousers and kitchen shoes.
Keep every entire person inside a separate equal-sized cell with generous transparent margins. Strict5x4 alignment for automatic cropping, no text or grid borders, no overlap, no background, no shadows. Truly transparent alpha. Warm watercolor storybook Japanese RPG illustration matching reference, clean edges, clear garment details. Portrait canvas about1536x2048 or higher. Prioritize the correct count of20 sprites and row/column consistency. All characters head-to-toe fully visible.
```

### 第3組

```text
Use case: stylized-concept. Asset type: transparent game costume atlas. Exactly TWENTY original full-body Lia sprites on a portrait canvas, aligned in strict FIVE equal-width columns and FOUR equal-height rows. Same original brown-haired amber-eyed character identity from reference. All face front, standing upright neutrally with hands at sides and no props. Rows top to bottom: age10 child, age13 early teen, age16 teen, age18 young adult; natural, modest and wholesome age progression.
Outfits by columns, same garment across the age rows:
1 HEALER: ivory high-collar long-sleeve full-length robe, pale green overcoat, small leaf brooch, brown shoes;
2 RANGER: forest green hooded cloak, brown long-sleeve tunic, loose trousers, walking boots;
3 FARMER: ochre long-sleeve work shirt, blue overalls, practical brown work boots, small straw hat;
4 SAILOR: classic navy and white long-sleeve sailor blouse, navy below-knee skirt, tights, flat shoes, little white sailor cap;
5 ARTIST: dusty rose long-sleeve shirt, loose beige trousers, paint-stained brown apron, burgundy beret, walking shoes.
Each cell has one complete head-to-toe figure centered with10% transparent margins. No overlapping cells, grid lines, words, labels, scenery, shadow backgrounds or logos. Truly transparent alpha background. Refined watercolor storybook Japanese RPG illustration consistent with reference, clean silhouettes and clothing details. Portrait approx1536x2048 or higher. Exact20 characters is essential for cropping.
```

### 第4組

```text
Use case: stylized-concept. Asset type: transparent costume atlas for a fantasy parenting game. A portrait atlas containing exactly TWENTY complete original Lia sprites in a precise FIVE-column FOUR-row grid, same brown hair, amber eyes, gentle curious identity as reference. Identical neutral standing front-facing pose, hands gently together or at sides, no props. Rows1-4 respectively age10 child, age13 early teen, age16 teen, age18 young adult. Natural age progression, wholesome and fully modest.
Each of FIVE COLUMNS is a costume worn consistently at all four ages:
1 SCHOLAR: warm charcoal academic full-length gown over cream shirt and long skirt, small navy academic cap, brown shoes;
2 DANCER: graceful lavender full-length high-neck performance gown with long sleeves and opaque fabric, flat dance shoes, hair ribbon, no bare midriff;
3 WINTER: warm cream wool coat, sage scarf, brown trousers, winter boots, simple knitted hat;
4 SUMMER: light mint short-sleeve collared blouse, loose cream below-knee skirt, closed flat shoes and straw sunhat;
5 HARVEST FESTIVAL: warm russet embroidered long-sleeve blouse, mustard below-knee folk skirt, dark tights and brown boots, floral hair ribbon.
Every sprite centered fully inside its equal-sized cell, head and shoes visible,10% clear transparent margin. No overlaps, grid lines, text, numbers, labels or background scenery. Truly transparent background, no cast shadow. Refined watercolor storybook Japanese RPG illustration with clear elegant details. Portrait1536x2048 or higher. Correct5columns x4rows twenty sprites needed for automatic crop.
```

### 構圖修正

```text
Edit this character atlas: correct ONLY the layout so all TWENTY characters fit completely. Preserve all five outfit columns, all four age rows, identity, watercolor art, colors, transparent background. The current fourth row is cut off at the bottom and rows crowd each other. Scale each character down about25%, rearrange into exactly5 equal-width columns x4 equal-height rows, each person wholly within their own cell with 12% transparent padding on all sides. All heads, hats, feet and full skirts MUST be visible. The fourth row must have complete shoes above the bottom margin. No text, no visible grid, no new costumes. Keep canvas portrait. Transparency essential. This is production sprite atlas with exact automatic row/column cropping, clean isolated characters and transparent gutters.
```

其他組使用相同修正方向：保留服裝、年齡與風格，縮小人物，補齊底列腳部並增加透明邊距。
