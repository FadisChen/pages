/* 納瓦爾寶典：書本資訊與目錄。已完成的節記在 ch/_done.js（由 finalize.py 產生） */
(function(){
const P1={partNo:'第一部',part:'財富'},P2={partNo:'第二部',part:'幸福'},PB={part:'附錄'};
const W={...P1,chapter:'打造財富'},J={...P1,chapter:'培養判斷力'};
const H={...P2,chapter:'學習幸福'},S={...P2,chapter:'拯救自己'},F={...P2,chapter:'人生哲學'};
const B={...PB,chapter:'納瓦爾推薦書單'};
Reader.book({
  id:'naval',
  title:'納瓦爾寶典',
  en:'THE ALMANACK OF NAVAL RAVIKANT',
  sub:'財富與幸福指南',
  author:'艾瑞克・喬根森　編著',
  back:'致富不只靠運氣；<br>幸福也不只是天生的特質。<br><br>這些目標看似遙不可及，<br>但創造財富與獲得幸福，<br>都是可以學會的技能。',
  toc:[
    {id:'rights',title:'版權資訊',front:true},
    {id:'dedication',title:'獻給父母',front:true},
    {id:'notes',title:'關於本書的重要說明（免責聲明）',front:true},
    {id:'foreword',title:'推薦序',front:true},
    {id:'eric',title:'艾瑞克的話（關於本書）',front:true},
    {id:'timeline',title:'納瓦爾・拉維肯年表',front:true},
    {id:'intro',title:'接下來，讓納瓦爾親口說……',front:true},

    {id:'w01',...W,title:'理解財富是如何創造的',partOpen:true,chapOpen:true,epi:'賺錢不是一件你去做的事，而是一項你要學會的技能。'},
    {id:'w02',...W,title:'找到並建立特定知識'},
    {id:'w03',...W,title:'與長期的人玩長期的遊戲'},
    {id:'w04',...W,title:'承擔責任'},
    {id:'w05',...W,title:'打造或買進企業股權'},
    {id:'w06',...W,title:'找到槓桿的位置'},
    {id:'w07',...W,title:'靠判斷力獲得報酬'},
    {id:'w08',...W,title:'排定優先順序並專注'},
    {id:'w09',...W,title:'找到感覺像玩樂的工作'},
    {id:'w10',...W,title:'如何變得幸運'},
    {id:'w11',...W,title:'保持耐心'},
    {id:'j01',...J,title:'判斷力',chapOpen:true,epi:'聰明沒有捷徑。'},
    {id:'j02',...J,title:'如何清晰地思考'},
    {id:'j03',...J,title:'拋開身分認同，看清現實'},
    {id:'j04',...J,title:'學習決策的技巧'},
    {id:'j05',...J,title:'蒐集心智模型'},
    {id:'j06',...J,title:'學會愛上閱讀'},

    {id:'h01',...H,title:'幸福是可以學習的',partOpen:true,chapOpen:true,epi:'別把自己看得太認真。你不過是隻有計畫的猴子。'},
    {id:'h02',...H,title:'幸福是一種選擇'},
    {id:'h03',...H,title:'幸福需要活在當下'},
    {id:'h04',...H,title:'幸福需要平靜'},
    {id:'h05',...H,title:'每一個慾望，都是你選擇的不快樂'},
    {id:'h06',...H,title:'成功換不來幸福'},
    {id:'h07',...H,title:'嫉妒是幸福的敵人'},
    {id:'h08',...H,title:'幸福靠習慣養成'},
    {id:'h09',...H,title:'在接納中找到幸福'},
    {id:'s01',...S,title:'選擇做自己',chapOpen:true,epi:'醫生無法讓你健康。營養師無法讓你苗條。老師無法讓你聰明。導師無法讓你平靜。良師益友無法讓你致富。教練無法讓你健壯。<br><br>最終，你必須為自己負責。<br><br>拯救自己。'},
    {id:'s02',...S,title:'選擇照顧自己'},
    {id:'s03',...S,title:'冥想與心智力量'},
    {id:'s04',...S,title:'選擇建設自己'},
    {id:'s05',...S,title:'選擇讓自己成長'},
    {id:'s06',...S,title:'選擇讓自己自由'},
    {id:'p01',...F,title:'人生的意義',chapOpen:true,epi:'真正的真理都是異端，不能宣之於口，只能自己發現、低聲傳述，或許還能從書中讀到。'},
    {id:'p02',...F,title:'依自己的價值觀生活'},
    {id:'p03',...F,title:'理性的佛教'},
    {id:'p04',...F,title:'當下就是我們擁有的一切'},

    {id:'b01',...B,title:'書籍',partOpen:true,chapOpen:true,epi:'真相是，我讀書並不是為了自我提升，而是出於好奇與興趣。最好的書，就是你會一口氣讀完的那一本。'},
    {id:'b02',...B,title:'其他推薦'},
    {id:'b03',...PB,title:'納瓦爾的文章'},
    {id:'b04',...PB,title:'繼續認識納瓦爾'},
    {id:'b05',...PB,title:'致謝'},
    {id:'b06',...PB,title:'資料來源'},
    {id:'b07',...PB,title:'關於作者'},
  ]
});
})();
