# 美術素材與生成記錄 · v0.2

日期：2026-10-18。依「原版過於保守」的回饋，使用內建 **imagegen skill／image_gen** 重新設計20套服裝與四階段角色，取代首版人物素材。

## 新版方向

- 清晰日系遊戲線稿、明亮珠寶色、細緻賽璐璐陰影。
- 強化剪裁、披風、刺繡、金屬、寶石、髮型及角色姿態。
- 泳裝改為連身泳裝與泳裙／罩裙，禮服增加層次與正式飾品。
- 惡魔裝、女僕服、騎士、魔法師等各自具有明確輪廓。
- 童年、初成長、青春與成年分別生成，拉開五官、比例及服裝細節差異；同一人物保留棕髮與琥珀眼。

## 最終檔案

| 位置 | 內容 |
| --- | --- |
| `assets/outfits/{id}-{stage}.webp` | 20套×4階段＝80張256×448透明人物 |
| `assets/wardrobe-catalog.webp` | 新版20套青春階段服裝一覽 |
| `assets/wardrobe.css` | 年齡與服裝映射 |
| `assets/wardrobe-manifest.json` | 來源圖集、列數、切分座標與尺寸 |
| `assets/town.webp` | 原創水彩王國背景 |
| `assets/emblem.svg` | 原生SVG星形徽章 |

角色年齡：stage0童年10–11歲（代表10歲）、stage1初成長12–14歲（代表13歲）、stage2青春15–17歲（代表16歲）、stage3成年18歲。

新版分8張5欄×2列圖集：每個五套服裝群組各有一張年幼版與一張年長版。這讓每個人物有更完整的繪製空間，也減少底列裁切問題。第二組年長版另外修正青春服裝的連續褲襪、領口及護甲細節。

## 切分與一覽

使用Python、Pillow、numpy、scipy切分，排除鄰格碎片，加透明邊距並壓縮WebP；程式沒有重畫人物。工具保留四張舊式4列圖集的相容性。

```sh
python dream/tools/split_wardrobe.py young1.png older1.png young2.png older2.png young3.png older3.png young4.png older4.png
python dream/tools/create_catalog.py
```

資料來源圖集是內建imagegen輸出。遊戲執行不需要以上製作工具或任何Python相依套件。人物沒有使用原作角色、標誌或截圖。

## 新版完整提示詞

### 第1組：童年／初成長

```text
Use case: stylized-concept. Asset: completely redesigned modern anime JRPG character costume atlas. Reference supplies ONLY original Lia's brown hair and amber eyes, not style or conservative clothing. New art: crisp clean linework, vibrant jewel colors, sophisticated cel shading, luminous eyes, distinctive silhouettes and hair accessories, polished commercial anime game art, no watercolor wash, no chibi.
Exactly FIVE columns by TWO rows, TEN complete full-body sprites with15% transparent margin in each equal cell. Top row age10 child with natural child anatomy, bottom row age13 early teen visibly taller and slightly more mature, both wholesome and clearly young. All front-facing standing relaxed, full shoes visible, no overlapping cells.
COLUMNS repeat outfit theme in both rows with practical age-appropriate design:
1 DAILY: ivory puff-sleeve blouse, sage leaf-button vest, layered sage and cream knee-length skirt, small ankle boots, playful hair ribbons;
2 ACADEMY: royal blue short cape, white shirt with emerald ribbon, navy knee-length pleated skirt, knee socks and school shoes, academic crest;
3 TRAVEL: warm tan short adventurer jacket, cream shirt, green walking shorts, opaque leggings, belt pouches and lace-up boots, ponytail;
4 SWIM: cheerful cobalt and turquoise athletic ONE-PIECE swimsuit with diagonal color blocking, simple swim skirt at waist, bare arms and legs, ordinary children's swimming attire, flat sandals and small sunhat, no body emphasis;
5 GALA: ruby red formal princess-style ball gown with puff sleeves, full layered floor-length skirt, gold star embroidery and festive hair bow.
Do not sexualize, no suggestive poses. Preserve same original character identity. True transparent alpha, no backdrop, no gridlines, no text or labels. Landscape approx1536x1024. Exactly10 complete characters, bottom row feet entirely inside canvas.
```

### 第1組：青春／成年

```text
Use case: stylized-concept. Asset: polished modern anime JRPG character costume atlas, a complete VISUAL REDESIGN of the attached old watercolor concept. Reference is only for Lia's brown hair and amber eyes. Replace the timid storybook look with bold confident commercial fantasy game character design: crisp ink outlines, luminous vivid colors, sophisticated cel shading, stronger graphic silhouettes, expressive elegant eyes, elaborate fabric trim, attractive distinctive hairstyles and accessories. No watercolor texture, no muted brown wash, no doll or chibi proportions. ORIGINAL character, no existing IP.
EXACTLY FIVE columns x TWO rows = TEN complete full-body figures. Top row age16 teen, bottom row age18 young adult, visibly older features and taller natural proportions on bottom row. Same face identity across outfits. All fully contained in equal cells with15% transparent padding, complete shoes, no overlap. Front-facing relaxed character pose, no large props.
FIVE outfit columns:
1 DAILY: fresh ivory puff-sleeve blouse, fitted sage vest, layered sage and cream knee-length skirt, decorative leaf clasps, lace-up ankle boots, ribbon half-up hairstyle;
2 ACADEMY: royal blue tailored short cape, white shirt with emerald ribbon, navy knee-length pleated skirt, dark knee socks, polished shoes, elegant academy crest;
3 TRAVEL: cropped tan adventurer jacket over high-neck cream top, green tailored shorts with practical opaque tights, utility belt and tall boots, confident ponytail;
4 SWIM: stylish cobalt and turquoise athletic ONE-PIECE swimsuit, tasteful diagonal color blocking, small lightweight wrap tied at waist, bare arms and legs, flat beach sandals, summer hair accessory, ordinary wholesome swimming outfit, no suggestive pose;
5 GALA: sophisticated ruby red formal floor-length gown, sculpted layered skirt, gold constellation embroidery, elegant neckline, short bolero on teen version, jeweled hair ornament and formal shoes.
Age-appropriate clothing, natural proportions, neutral non-sexual presentation. Transparent alpha background, no text, no grid lines, no labels, no scenery, no shadows. Wide landscape composition approx1536x1024, all10 figures head to toe and entire bottom row feet visible. High detail outfit separation; do not copy old conservative outfits.
```

### 第2組：童年／初成長

```text
Use case: stylized-concept. Asset: bold colorful modern anime JRPG original character costume atlas. Use reference ONLY for Lia's brown hair and amber eyes; redesign old watercolor styling with crisp ink, vibrant jewels and clear cel shading, rich trim and distinct fashion silhouettes. Not chibi, no muddy muted palette.
Strict FIVE columns by TWO rows = TEN complete front-facing full-body sprites, each inside equal cell with15% transparent margin. Top row age10 child with natural youthful proportions, bottom row age13 early teen visibly taller. Clearly young, wholesome, no body emphasis. Original same character, expressive curious faces, bows and braids vary by costume.
Columns:
1 DEMON: playful crimson-and-black fairytale outfit, small decorative horns, red-lined capelet, high-neck tunic, knee-length layered skirt over opaque leggings, sturdy boots, small bat wing ornaments;
2 MAID: cheerful classic black and white knee-length maid dress, high-neck white puff-sleeve blouse, elaborate white lace apron, opaque dark stockings, flat Mary Jane shoes, white headband, tied braid;
3 KNIGHT: child-sized silver and sapphire light armor over navy long-sleeve tunic and trousers, blue cape, armored boots, practical and fully covered;
4 MAGE: vivid cobalt and violet star-embroidered robe with layered knee-length skirt and opaque leggings, large pointed wizard hat, crystal ornament and ankle boots;
5 CHEF: white chef jacket, red neckerchief, brown apron, black trousers, chef hat and flat kitchen shoes.
All age appropriate, no suggestive pose, no sexuality. Actual transparent alpha, no grid lines, labels, words or backdrop. Landscape1536x1024 or higher; every complete character including hat and shoes wholly visible.
```

### 第2組：青春／成年

```text
Use case: stylized-concept. Asset: visually bold, polished modern anime JRPG character costume atlas. Reference only for original Lia's brown hair and amber eyes. Completely redesign old watercolor costume look with crisp lineart, jewel-tone colors, rich cel shading, confident expressive faces, stylish varied hairdos, strong fashion silhouettes. No watercolor, no timid muted palette, no chibi. Original IP.
EXACTLY5 equal columns x2 equal rows =10 full-body sprites, all complete with15% clear transparent padding inside every cell. Top row16-year-old teen, bottom row18-year-old young adult; clear face and proportion maturation, natural age-appropriate anatomy. Relaxed standing front view, no large props.
COLUMNS:
1 DEMON: theatrical crimson and black fantasy demon costume, curved decorative horns, angular red-lined short cape, high-collar dark tunic with flame embroidery, asymmetric knee-length skirt over opaque black leggings, tall boots, small stylized bat wings, bold confident fairytale sorceress silhouette, no sexualization;
2 MAID: elegant black-and-white fantasy maid dress with crisp fitted bodice over high-neck puff-sleeve blouse, layered knee-length skirt with elaborate white lace apron, dark opaque stockings, polished shoes, elaborate white headband and tied-back braid, proud charming service-professional character;
3 KNIGHT: sculpted silver-and-sapphire armor over navy tunic, fitted practical trousers, armored boots and gauntlets, asymmetric royal blue cape, heroic ponytail, no exposed midriff;
4 MAGE: cobalt and violet layered fantasy robe, asymmetric sleeves, gold star embroidery, dramatic pointed hat with crystal ornament, knee-length layered skirt with opaque leggings, elegant boots;
5 CHEF: stylish white double-breasted chef jacket with rolled sleeves, red neckerchief, deep brown waist apron, tailored black trousers, white chef hat and polished black kitchen shoes.
Non-sexual character art, true transparent alpha. No gridlines, text, labels or scenery. Wide landscape approx1536x1024; every hat and all shoes fully inside canvas, no crop.
```

### 第3組：童年／初成長

```text
Use case: stylized-concept. Asset: original child and early teen character atlas in polished modern anime JRPG style. Reference ONLY for Lia's brown hair and amber eyes. New art direction: clean crisp lineart, bright jewel colors, luminous cel shading, expressive young faces, richly detailed garments and clear silhouettes, no watercolor or muddy palette, no chibi.
Exactly FIVE columns x TWO rows = TEN complete full-body figures. Top row age10 child, bottom row age13 early teen with natural gradual age progression. Youthful and wholesome, normal modest children's clothing. Front-facing relaxed standing, same face identity across costumes. Every figure in an equal cell with15% clear alpha padding and no overlaps.
COLUMNS:
1 HEALER: ivory and emerald fantasy dress with leaf clasps, long-sleeve high-neck blouse, knee-length layered skirt, small green cape, white stockings and ankle boots, braided hair ribbon;
2 RANGER: bright forest green hooded capelet, practical long-sleeve tunic, brown hiking shorts over opaque leggings, belt pouches and tall boots;
3 FARMER: sunny mustard rolled-sleeve shirt, indigo overalls, brown boots, red bandana and small straw hat;
4 SAILOR: white long-sleeve sailor blouse with blue bow, navy knee-length pleated skirt, knee socks, white flat shoes, sailor cap;
5 ARTIST: coral puff-sleeve blouse, charcoal wide-leg trouser overalls, short painted apron, raspberry beret, comfortable loafers and playful side braid.
No sexuality, no suggestive pose. True transparent alpha, no gridlines, words, labels or backgrounds. Landscape1536x1024, all10 figures wholly visible head-to-toe including bottom shoes.
```

### 第3組：青春／成年

```text
Use case: stylized-concept. Asset: fully redesigned modern anime JRPG fashion character atlas. Reference only provides original Lia's brown hair and amber eyes. Replace old watercolor look with crisp detailed ink outlines, vivid luminous colors, cel shading, confident expressive character faces, dynamic fashion silhouettes and unique hairstyles. No watercolor texture, no dull brown palette, no chibi.
Exactly FIVE columns x TWO rows = TEN full-body characters, front-facing relaxed standing. Top row age16 teen, bottom row age18 young adult with clearly more mature facial features and proportions. Natural, age appropriate and non-sexual. Same character identity. Each inside its own equal cell with15% clear alpha padding, no overlapping garments or props.
COLUMNS:
1 HEALER: luminous ivory and emerald fantasy healer dress, fitted high-neck tunic with gold leaf clasps, flared layered knee-length skirt, flowing open green cape, white stockings and gold-trim ankle boots, braided crown hairstyle;
2 RANGER: emerald hooded short cape, forest green tailored tunic, brown walking shorts over opaque tights, leather bracers, belt pouches, high boots and ponytail;
3 FARMER: bright mustard rolled-sleeve shirt, fitted indigo overalls with trousers tucked into boots, red bandana, straw hat, cheerful practical countryside outfit;
4 SAILOR: crisp white and navy sailor top with blue bow, flattering knee-length pleated navy skirt, knee socks, white flat shoes and sailor cap, polished nautical heroine silhouette;
5 ARTIST: coral puff-sleeve blouse, artistic charcoal overalls with wide-leg cropped trousers, short paint-marked apron, oversized raspberry beret, loafers and loose side braid.
Fully transparent background, no scenery, no labels or gridlines, no shadows behind figures. Landscape approx1536x1024, complete hats and shoes including bottom row.
```

### 第4組：童年／初成長

```text
Use case: stylized-concept. Asset: redesigned original child and early teen JRPG character fashion atlas. Old reference gives only Lia's brown hair and amber eyes; use NEW crisp anime lineart, bright rich colors, luminous cel shading, expressive natural young faces, distinct fashionable silhouettes and lovely accessories. No watercolor, dull palette or chibi.
Exactly FIVE columns by TWO rows = TEN full-body sprites, top row age10 child and bottom row age13 early teen, clearly young and gradually taller. Same identity in each costume. Front-facing standing, normal child proportions, age-appropriate wholesome clothing.15% clear transparent margins inside each equal cell. Entire hats, skirts, legs and shoes visible, no overlaps.
COLUMNS:
1 SCHOLAR: midnight blue short academic cape with gold star trim, white high-neck shirt and turquoise ribbon, dark vest, knee-length skirt, opaque leggings, buckled shoes and little academic cap;
2 DANCER: lavender fantasy performance dress with puff sleeves, flowing full-length layered skirt, crystal trim, ribbons and flat dance shoes, ordinary fully covered children's stage costume;
3 WINTER: ivory wool coat with green lining, sage scarf, dark trousers, winter boots, knitted beret and braids;
4 SUMMER: mint short-sleeve collared blouse, white knee-length A-line skirt, turquoise sash, flat summer sandals and small flower straw hat;
5 HARVEST: burnt-orange puff-sleeve blouse, embroidered burgundy vest, golden knee-length folk skirt, knee socks, lace-up boots, flower hair ribbons.
No body emphasis or suggestiveness. True transparent alpha background, no grids, lettering, labels or scenery. Landscape1536x1024, exactly10 complete character sprites.
```

### 第4組：青春／成年

```text
Use case: stylized-concept. Asset: bold modern anime JRPG original character fashion atlas. Use old reference ONLY for Lia's brown hair and amber eyes; radically update art to crisp commercial anime linework, sophisticated cel shading, vivid luminous rich colors, confident expressive features, elegant outfit silhouettes with distinctive hair styling and accessories. No watercolor, no chibi or toddler proportions, no dull sepia.
Strict FIVE equal columns x TWO equal rows = TEN complete full-body characters, top row16-year-old teen and bottom row18-year-old young adult, noticeably maturing facial features and natural taller proportions. Standing front-facing neutral and non-sexual. 15% transparent padding per cell, no overlapping clothes, all hats and feet complete.
COLUMNS:
1 SCHOLAR: sophisticated midnight blue academic cape with gold constellation lining, white shirt and turquoise ribbon, tailored dark vest, knee-length pleated skirt with opaque leggings, gold-buckled shoes, small academic cap;
2 DANCER: elegant lavender and violet performance dress, graceful draped sleeves, asymmetric layered full-length skirt, gold and crystal trim, ribbon hairstyle and dance shoes, stage-ready dramatic fabric without revealing cuts;
3 WINTER: stylish ivory belted wool coat with emerald lining, sage scarf, dark green fitted trousers, tall winter boots, knitted beret and braided hair;
4 SUMMER: fresh mint short-sleeve sailor-collar blouse, white high-waisted knee-length A-line skirt, turquoise waist ribbon, strappy flat sandals, straw sunhat with flowers;
5 HARVEST FESTIVAL: vivid burnt-orange puff-sleeve blouse, fitted embroidered burgundy waistcoat, golden layered knee-length folk skirt, dark knee socks, lace-up boots and festive flower ribbons.
Original age-appropriate heroine costume art. Actual alpha transparency, no text, no gridlines, no scenery. Landscape1536x1024 or higher, no cropped bottom row.
```

### 第二組青春服裝細節修正

```text
Edit ONLY the TOP ROW age16 characters in this five-column two-row character atlas. Keep vivid modern anime style, all identities, positions, full-body framing, ALL BOTTOM ROW age18 designs, and transparent background unchanged. For top-row DEMON column1 replace all legwear with continuous fully opaque black fitted trousers or thick opaque tights all the way from the knee-length layered skirt to boots, remove any garter straps or thigh gaps, give a closed high-neck crimson embroidered upper tunic. Keep demon horns, red cape and wings dramatic. Top-row MAID column2 keep a high-neck closed white blouse, knee-length lace apron dress and continuous fully opaque black tights. Top-row KNIGHT column3 use continuous dark navy trousers under the armor, no exposed upper-thigh skin. Top-row MAGE column4 keep high-neck layered blouse and fully opaque leggings. Top-row CHEF unchanged. These are stylish, non-sexual teenage fantasy outfits: emphasize embroidery, silhouettes and bold colors, no lingerie elements. Preserve every entire figure inside its own cell and all feet, no text, no labels, no scenery, true alpha transparency.
```

## 背景生成摘要

原創歐式奇幻山城、城堡、花園、春日金色光線，水彩及粉彩繪本背景，1536×1024，無角色、無文字、無既有IP。此輪重新生成的範圍為角色與服裝。
