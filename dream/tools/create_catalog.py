"""Render a contact sheet from the final split wardrobe assets (Pillow required)."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
IDS=['daily','academy','travel','swim','gala','demon','maid','knight','mage','chef','healer','ranger','farmer','sailor','artist','scholar','dancer','winter','summer','festival']
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(FONT,14);big=ImageFont.truetype(FONT,25)
canvas=Image.new('RGB',(1100,1530),'#f7f4e9');draw=ImageDraw.Draw(canvas)
draw.text((40,24),'STARWISH JOURNAL / WARDROBE',fill='#5f7351',font=big)
draw.text((40,65),'20 OUTFITS  /  4 GROWTH STAGES  /  ORIGINAL CHARACTER ART',fill='#92967e',font=font)
for i,name in enumerate(IDS):
 x=(i%5)*212+20;y=(i//5)*350+110
 draw.rounded_rectangle((x,y,x+198,y+330),radius=10,fill='#eeeee1',outline='#dadfca')
 im=Image.open(ROOT/'assets'/'outfits'/f'{name}-2.webp').convert('RGBA');im.thumbnail((172,282))
 canvas.paste(im,(x+(198-im.width)//2,y+4),im)
 draw.text((x+12,y+299),f'{i+1:02}  {name.upper()}',fill='#5a6d4b',font=font)
canvas.save(ROOT/'assets'/'wardrobe-catalog.webp',quality=92,method=4)
