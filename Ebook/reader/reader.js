/* 共用電子書閱讀器
 * 書本資料：book.js 呼叫 Reader.book({...})
 * 章節資料：ch/<id>.js 呼叫 Reader.chapter('<id>', [[type, text, extra], ...])
 * 區塊類型：p 內文、q 訪談提問、a 語錄、tw 推文串、li 條列、note 編者按、quote 引文(extra=出處)、
 *          pull 金句、h2 小標、h3 次小標。文字中的 [78] 會轉成上標來源編號。
 */
(function(){
'use strict';
const R=window.Reader={};
let META=null,flip=null,pages=[],view=null,anchor=0,lastDims='',fsMul=1,building=false,pending=false;
let pageEls=[],builtHome=true,navDir=null,bridging=false,ttsNav=false;
const CH={},waiters={};
const $=s=>document.querySelector(s);
const FS_STEPS=[.9,1,1.12,1.25];

R.book=m=>{META=m};
// ch/_done.js 呼叫：列出已完成的節（由 finalize.py 產生）
R.done=ids=>ids.forEach(id=>{const e=META&&META.toc.find(x=>x.id===id);if(e)e.done=true});
R.chapter=(id,blocks)=>{CH[id]=blocks;if(waiters[id])waiters[id]()};

const store={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
const key=()=>'reader:'+META.id;

function loadChapter(id){
  if(CH[id])return Promise.resolve();
  return new Promise((res,rej)=>{
    waiters[id]=res;
    const s=document.createElement('script');s.src='ch/'+id+'.js';
    s.onerror=()=>rej(new Error('找不到章節檔 ch/'+id+'.js'));
    document.head.appendChild(s);
  });
}

/* ---------- 區塊 ---------- */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 切成 [字串, 在原文中的位移]，位移用來記錄重點的位置
const tokenize=s=>{const out=[];const re=/\[\d+\]|[A-Za-z0-9’'.\-]+|\s+|[\s\S]/g;let m;while((m=re.exec(s)))out.push([m[0],m.index]);return out};
// hl：本區塊的重點範圍 [{s,e,n}]，落在範圍內的字包進 <mark>
function tokHTML(ts,hl){
  let out='',open=null;
  for(const [t,o] of ts){
    const h=hl&&hl.find(r=>o<r.e&&o+t.length>r.s);const n=h?h.n:null;
    if(n!==open){if(open!==null)out+='</mark>';if(n!==null)out+=`<mark data-n="${n}">`;open=n}
    out+=/^\[\d+\]$/.test(t)?`<sup class="ref" data-l="${t.length}">${t.slice(1,-1)}</sup>`:esc(t);
  }
  if(open!==null)out+='</mark>';
  return out;
}
const SPLIT=new Set(['p','a','tw','li','note']);
const MARKED=new Set(['h1','h2','pull']);
let HL=new Map();   // ci → 重點範圍，建書時依目前章節計算

// 可畫重點的文字容器：記下區塊序號與第一個字的位移
function textBox(tag,b,toks){
  const el=document.createElement(tag);
  toks=toks||b.toks||tokenize(b.text);
  el.innerHTML=tokHTML(toks,b.ci!=null?HL.get(b.ci):null);
  if(b.ci!=null&&toks.length){el.dataset.ci=b.ci;el.dataset.o=toks[0][1]}
  return el;
}

function blockEl(b,toks){
  let el;
  switch(b.t){
    case 'h1':case 'h2':case 'h3':
      if(MARKED.has(b.t)){el=document.createElement(b.t);el.appendChild(textBox('span',b))}
      else el=textBox(b.t,b);
      break;
    case 'pull':
      el=document.createElement('p');el.className='pull';el.appendChild(textBox('span',b));break;
    case 'quote':
      el=document.createElement('div');el.className='quote';el.appendChild(textBox('p',b));
      if(b.x)el.insertAdjacentHTML('beforeend',`<p class="by">——${esc(b.x)}</p>`);break;
    case 'toch':case 'tocp':case 'tocc':
      el=document.createElement('div');el.className=b.t;el.textContent=b.text;break;
    case 'toci':
      el=document.createElement('a');el.className='toci'+(b.x.done?'':' off');
      if(b.x.done)el.dataset.go=b.x.id;
      el.innerHTML=`<span>${esc(b.text)}</span>`+(b.x.done?'':'<small>尚未翻譯</small>');break;
    case 'end':{
      el=document.createElement('div');el.className='end';
      const n=b.x;
      el.innerHTML='— 本節完 —<br>'+(!n?'<span>全書完</span>':
        n.done?`<a data-go="${esc(n.id)}">下一節：${esc(n.title)} ›</a>`:`<span class="off">下一節「${esc(n.title)}」尚未翻譯</span>`);
      break;}
    default:
      el=textBox('p',b,toks);el.classList.add(b.t);
  }
  if(b.cont)el.classList.add('cont');
  el._b=b;return el;
}

/* ---------- 版面尺寸 ---------- */
function dims(){
  const r=$('#stage').getBoundingClientRect();
  const W=Math.floor(r.width-32),H=Math.floor(r.height-24);
  const spread=W>=900&&W>H*1.15;
  const pw=Math.floor(spread?Math.min(W/2,H*.72):Math.min(W,H*.78)),ph=H;
  const fs=Math.round(Math.max(16,Math.min(19.5,pw/26))*fsMul*2)/2;
  const pad=Math.round(Math.max(20,Math.min(56,pw*.085)));
  return {pw,ph,fs,pad,spread};
}
function shell(cls){
  const pg=document.createElement('div');pg.className='page '+(cls||'');
  pg.innerHTML='<div class="pin"><div class="rh"></div><div class="pbody"></div><div class="pf"></div></div>';
  return pg;
}
const bookVars=d=>`--pw:${d.pw}px;--ph:${d.ph}px;--fs:${d.fs}px;--pad:${d.pad}px`;

/* ---------- 分頁：把區塊倒進固定尺寸的頁面，段落可在字元層級切開 ---------- */
function paginate(blocks,d){
  const meas=document.createElement('div');meas.className='book';
  meas.style.cssText=`position:fixed;left:-99999px;top:0;visibility:hidden;${bookVars(d)}`;
  const pg=shell();pg.style.cssText=`position:relative;width:${d.pw}px;height:${d.ph}px`;
  meas.appendChild(pg);document.body.appendChild(meas);
  pg.querySelector('.rh').textContent=META.title;pg.querySelector('.pf').textContent='0';
  const body=pg.querySelector('.pbody');
  const fits=()=>body.scrollHeight<=body.clientHeight+1;
  const out=[];let first=null;
  const flush=q=>{
    // 標題與提問不可落單在頁尾，移到下一頁
    const keep=el=>/^H[123]$/.test(el.tagName)||(el.classList.contains('q')&&!el.classList.contains('cont'));
    while(body.children.length>1&&keep(body.lastElementChild)){
      q.unshift(body.lastElementChild._b);body.lastElementChild.remove();
    }
    if(!body.children.length)return;
    out.push({type:'text',html:body.innerHTML,first});
    body.innerHTML='';first=null;
  };
  const q=blocks.map(b=>({...b}));
  while(q.length){
    const b=q.shift();
    if(b.t==='opener'){flush(q);out.push({type:'opener',b,first:b.i});continue}
    const el=blockEl(b);body.appendChild(el);
    if(first===null)first=b.i;
    if(fits())continue;
    el.remove();
    if(SPLIT.has(b.t)){
      const toks=b.toks||tokenize(b.text);
      let lo=0,hi=toks.length;
      while(lo<hi){const m=(lo+hi+1)>>1;const t=blockEl(b,toks.slice(0,m));body.appendChild(t);const ok=fits();t.remove();if(ok)lo=m;else hi=m-1}
      while(lo>0&&lo<toks.length&&/^[，。、；：！？）」』》]/.test(toks[lo][0]))lo--;
      if(lo>=6&&lo<toks.length){
        body.appendChild(blockEl(b,toks.slice(0,lo)));
        q.unshift({...b,toks:toks.slice(lo),cont:true});
        flush(q);continue;
      }
    }
    if(!body.children.length){body.appendChild(el);flush(q);continue}
    q.unshift(b);flush(q);
  }
  flush(q);meas.remove();
  return out;
}

/* ---------- 各視圖的區塊 ---------- */
function norm(list){return list.map((b,i)=>({t:b[0],text:b[1]||'',x:b[2],i}))}
function homeBlocks(){
  const L=[['toch','目錄']];let part=null,chap=null;
  META.toc.forEach(e=>{
    if(e.part&&e.part!==part){part=e.part;L.push(['tocp',[e.partNo,e.part].filter(Boolean).join('　')])}
    if(e.chapter&&e.chapter!==chap){chap=e.chapter;L.push(['tocc',e.chapter])}
    if(e.front||e.back){chap=null}
    L.push(['toci',e.title,{id:e.id,done:!!e.done}]);
  });
  return norm(L);
}
function chapterBlocks(id){
  const idx=META.toc.findIndex(e=>e.id===id),e=META.toc[idx];
  const L=[];
  if(e.partOpen)L.push(['opener','',{k:e.partNo||'',title:e.part}]);
  if(e.chapOpen)L.push(['opener','',{k:[e.partNo,e.part].filter(Boolean).join('　'),title:e.chapter,epi:e.epi}]);
  L.push(['h1',e.title]);
  const off=L.length;
  CH[id].forEach(b=>L.push(b));
  L.push(['end','',META.toc[idx+1]||null]);
  const n=norm(L);
  n.forEach(b=>{if(b.t==='opener')b.o=b.x;if(b.i>=off&&b.i<off+CH[id].length)b.ci=b.i-off});
  return n;
}

function buildPages(list,isHome,sec){
  const els=[];
  if(isHome){
    const c=shell('cover');c.dataset.density='hard';
    c.querySelector('.pin').innerHTML=`<div class="cv-k">${esc(META.en)}</div><div class="cv-t">${esc(META.title)}</div><div class="cv-s">${esc(META.sub)}</div><div class="cv-a">${esc(META.author)}</div>`;
    els.push(c);
  }
  let n=0;
  list.forEach(p=>{
    n++;
    if(p.type==='opener'){
      const e=shell('opener');const o=p.b.o;
      e.querySelector('.pin').innerHTML=`<div class="op-k">${esc(o.k)}</div><div class="op-t">${esc(o.title)}</div>${o.epi?`<div class="op-e">${esc(o.epi)}</div>`:''}`;
      els.push(e);
    }else{
      const e=shell();
      e.querySelector('.rh').textContent=n%2?META.title:sec;
      e.querySelector('.pbody').innerHTML=p.html;
      e.querySelector('.pf').textContent=n;
      els.push(e);
    }
  });
  if(isHome){
    if(els.length%2===1)els.push(shell('blank'));
    const b=shell('back');b.dataset.density='hard';
    b.querySelector('.pin').innerHTML=`<div class="bk">${META.back||''}</div>`;
    els.push(b);
  }else if(els.length%2===1)els.push(shell('blank'));
  return els;
}

/* ---------- 建書 ---------- */
async function fontsReady(text){
  const fam=['400 16px "LXGW WenKai TC"','700 16px "LXGW WenKai TC"','900 16px "Noto Serif TC"','400 16px "Noto Serif TC"'];
  if(!document.fonts)return;
  await Promise.race([Promise.all(fam.map(f=>document.fonts.load(f,text).catch(()=>{}))),new Promise(r=>setTimeout(r,4000))]);
}
function currentAnchor(){
  if(!flip||!pages.length||bridging)return anchor;
  const i=flip.getCurrentPageIndex()-(view.home?1:0);
  const p=pages[Math.max(0,Math.min(pages.length-1,i))];
  return p?p.first:anchor;
}
function saveState(){store.set(key(),{view:view.home?'home':view.id,block:currentAnchor()})}

// 橋接頁：換章時把舊章目前看得到的頁面接到新書前/後，翻過去就有翻頁動畫
function cloneBridge(el){
  const c=el.cloneNode(true);c.removeAttribute('style');
  c.classList.remove(...[...c.classList].filter(k=>k.startsWith('stf__')||k.startsWith('--')));
  c.querySelectorAll('[data-ci]').forEach(e=>e.removeAttribute('data-ci'));
  c.querySelectorAll('.tts-on').forEach(e=>e.classList.remove('tts-on'));
  return c;
}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

async function build(){
  if(building){pending=true;return}
  building=true;
  const dir=navDir;navDir=null;
  const msg=$('#msg');msg.textContent='排版中…';msg.hidden=false;
  hideTip();
  try{
    if(!view.home)await loadChapter(view.id);
    const blocks=view.home?homeBlocks():chapterBlocks(view.id);
    HL=hlMap(view.home?null:view.id);
    if(anchor&&typeof anchor==='object')anchor=(blocks.find(b=>b.ci===anchor.ci)||{i:0}).i;
    const sec=view.home?'目錄':META.toc.find(e=>e.id===view.id).title;
    await fontsReady(META.title+META.sub+blocks.map(b=>b.text+(b.o?b.o.title+(b.o.epi||'')+b.o.k:'')).join(''));
    const d=dims(),dk=`${d.pw}x${d.ph}x${d.fs}`;
    pages=paginate(blocks,d);
    let bridge=null;
    if(dir&&flip&&!builtHome&&!view.home&&dk===lastDims&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const cur=flip.getCurrentPageIndex(),n=d.spread?2:1;
      bridge=pageEls.slice(cur,cur+n).map(cloneBridge);
      if(bridge.length!==n)bridge=null;
    }
    lastDims=dk;
    if(flip){try{flip.destroy()}catch(e){}flip=null}
    document.querySelectorAll('.book-host').forEach(e=>e.remove());
    const host=document.createElement('div');host.className='book-host';host.style.width=(d.spread?d.pw*2:d.pw)+'px';
    const book=document.createElement('div');book.className='book';book.style.cssText=bookVars(d);
    host.appendChild(book);$('#stage').appendChild(host);
    pageEls=buildPages(pages,view.home,sec);builtHome=!!view.home;
    const all=!bridge?pageEls:dir==='next'?[...bridge,...pageEls]:[...pageEls,...bridge];
    all.forEach(e=>book.appendChild(e));
    flip=new St.PageFlip(book,{width:d.pw,height:d.ph,size:'fixed',showCover:view.home,usePortrait:true,
      maxShadowOpacity:.45,mobileScrollSupport:false,flippingTime:700});
    flip.loadFromHTML(all);
    let start=0;
    if(bridge)start=dir==='next'?0:pageEls.length;
    else if(anchor===Infinity)start=flip.getPageCount()-1;
    else if(anchor==='toc')start=1;   // 封面後的第一頁就是目錄
    else if(anchor>0){
      const k=pages.findIndex((p,i)=>p.first!=null&&p.first<=anchor&&!(pages.slice(i+1).find(x=>x.first!=null)?.first<=anchor));
      if(k>=0)start=k+(view.home?1:0);
    }
    if(start)flip.turnToPage(start);
    flip.on('flip',()=>{if(bridging)return;updateBar();saveState()});
    flip.on('changeOrientation',()=>{if(!bridging)updateBar()});
    msg.hidden=true;
    if(bridge){
      // page-flip 的動畫起點取自 rAF 更新的時間，建好後要等幾個影格再翻，否則會直接跳到結尾
      bridging=true;
      const f=flip;
      try{
        await nextFrame();
        await Promise.race([
          new Promise(res=>{f.on('changeState',e=>{if(e.data==='read')res()});dir==='next'?f.flipNext():f.flipPrev()}),
          new Promise(res=>setTimeout(res,1500))
        ]);
        f.updateFromHtml(pageEls);
        if(dir==='next')f.turnToPage(0);
      }finally{bridging=false}
    }
    anchor=currentAnchor();
    updateBar();saveState();
    ttsBuilt();
  }catch(err){
    msg.textContent=err.message;msg.hidden=false;
  }
  building=false;
  if(pending){pending=false;build()}
}

/* ---------- 導覽 ---------- */
function open(v,a,dir){
  if(ttsNav)ttsNav=false;else ttsStop();   // 使用者自己換章就停止朗讀
  view=v;anchor=a||0;navDir=dir||null;build();
}
function doneIndex(from,step){
  for(let i=from+step;i>=0&&i<META.toc.length;i+=step)if(META.toc[i].done)return i;
  return -1;
}
function atEnd(){const i=flip.getCurrentPageIndex(),n=flip.getPageCount();return i>=n-(flip.getOrientation()==='landscape'?2:1)}
function next(){
  if(!flip)return;
  if(!atEnd())return flip.flipNext();
  if(view.home){const k=doneIndex(-1,1);if(k>=0)open({id:META.toc[k].id});return}
  const k=doneIndex(META.toc.findIndex(e=>e.id===view.id),1);
  if(k>=0)open({id:META.toc[k].id},0,'next');
}
function prev(){
  if(!flip)return;
  if(flip.getCurrentPageIndex()>0)return flip.flipPrev();
  if(view.home)return;
  const k=doneIndex(META.toc.findIndex(e=>e.id===view.id),-1);
  if(k>=0)open({id:META.toc[k].id},Infinity,'prev');else open({home:true},Infinity);
}
function updateBar(){
  if(!flip)return;
  const i=flip.getCurrentPageIndex(),n=flip.getPageCount();
  $('#ind').textContent=`${i+1} / ${n}`;
  $('#prev').disabled=view.home&&i<=0;
  $('#next').disabled=atEnd()&&(view.home?doneIndex(-1,1)<0:doneIndex(META.toc.findIndex(e=>e.id===view.id),1)<0);
  $('#tts-btn').disabled=view.home||!synth;
}

/* 單頁模式下，StPageFlip 需把頁角拖過頁面左緣才算翻頁；拖過頁寬一半放開就補一個到左緣的移動 */
function assistFlip(e){
  if(!flip||flip.getOrientation()!=='portrait'||flip.getState()!=='user_fold')return;
  const pt=e.changedTouches?e.changedTouches[0]:e;
  const r=document.querySelector('.book.stf__parent').getBoundingClientRect();
  if(pt.clientX>r.left+r.width*.5)return;
  const x=r.left-4,y=pt.clientY;
  try{
    if(e.changedTouches){
      const t=new Touch({identifier:pt.identifier,target:e.target,clientX:x,clientY:y,pageX:x,pageY:y});
      window.dispatchEvent(new TouchEvent('touchmove',{changedTouches:[t],touches:[t]}));
    }else window.dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y}));
  }catch(err){}
}

/* ---------- 翻頁感應區：只有頁面左右兩側（含頁角）交給翻頁套件，中間留給選字 ---------- */
function edgeZone(e){
  const host=e.target.closest&&e.target.closest('.book-host');
  if(!host||!flip)return null;
  const pt=e.touches?e.touches[0]:e,r=host.getBoundingClientRect();
  const z=Math.max(36,Math.min(72,r.width*(flip.getOrientation()==='landscape'?.06:.12)));
  const x=pt.clientX-r.left;
  return x<z?'left':x>r.width-z?'right':'';
}
function gate(e){
  const z=edgeZone(e);
  if(z==='')e.stopPropagation();   // 不在兩側：不讓 StPageFlip 收到，保留原生選字
}
/* 章末/章首的邊緣點擊或滑動改成換章（StPageFlip 不會翻過最後一頁，也不會往第一頁之前翻） */
let edgeTap=null;
function edgeDown(e){
  edgeTap=null;
  if(!flip||building||e.button>0||e.target.closest('a,button,[data-go]'))return;
  const z=edgeZone(e);
  const go=z==='right'&&atEnd()?next:z==='left'&&flip.getCurrentPageIndex()===0?prev:null;
  if(go)edgeTap={go,x:e.clientX,y:e.clientY,dir:z==='right'?-1:1};
}
function edgeUp(e){
  const t=edgeTap;edgeTap=null;
  if(!t||building)return;
  const dx=e.clientX-t.x,dy=Math.abs(e.clientY-t.y);
  // 點一下，或往翻頁方向滑動
  if((Math.abs(dx)<10&&dy<10)||(dx*t.dir>30&&dy<Math.abs(dx)))t.go();
}

/* ---------- 畫重點 ---------- */
const notesKey=()=>'notes:'+META.id;
const loadNotes=()=>store.get(notesKey(),[]);
const saveNotes=n=>store.set(notesKey(),n);
function hlMap(ch){
  const m=new Map();if(!ch)return m;
  loadNotes().forEach(n=>{if(n.ch!==ch)return;n.segs.forEach(s=>{
    if(!m.has(s.ci))m.set(s.ci,[]);m.get(s.ci).push({s:s.s,e:s.e,n:n.id});
  })});
  return m;
}
// 從區塊開頭到指定位置的原文長度（上標來源編號以原文 [78] 的長度計）
function srcLen(el,node,off){
  const rg=document.createRange();rg.setStart(el,0);rg.setEnd(node,off);
  const w=document.createTreeWalker(rg.cloneContents(),NodeFilter.SHOW_TEXT);
  let n=0,t;
  while((t=w.nextNode())){const sup=t.parentElement&&t.parentElement.closest('sup');n+=sup?+sup.dataset.l:t.length}
  return n;
}
function selectionSegs(){
  const sel=getSelection();
  if(!sel.rangeCount||sel.isCollapsed||view.home)return null;
  const r=sel.getRangeAt(0),by={};
  document.querySelectorAll('.book [data-ci]').forEach(el=>{
    if(!r.intersectsNode(el))return;
    const base=+el.dataset.o;
    const s=base+(el.contains(r.startContainer)?srcLen(el,r.startContainer,r.startOffset):0);
    const e=base+(el.contains(r.endContainer)?srcLen(el,r.endContainer,r.endOffset):srcLen(el,el,el.childNodes.length));
    if(e<=s)return;
    const ci=+el.dataset.ci;
    by[ci]=by[ci]?{ci,s:Math.min(by[ci].s,s),e:Math.max(by[ci].e,e)}:{ci,s,e};
  });
  const segs=Object.values(by);
  const text=sel.toString().replace(/\s+/g,' ').trim();
  return segs.length&&text?{segs,text}:null;
}
function showTip(label,rect,fn){
  const t=$('#tip');t.textContent=label;t.hidden=false;
  const w=t.offsetWidth,h=t.offsetHeight;
  let x=rect.left+rect.width/2-w/2,y=rect.bottom+10;
  if(y+h>innerHeight-70)y=rect.top-h-10;
  t.style.left=Math.max(8,Math.min(innerWidth-w-8,x))+'px';t.style.top=Math.max(8,y)+'px';
  t.onclick=ev=>{ev.stopPropagation();hideTip();fn()};
}
function hideTip(){const t=document.querySelector('#tip');if(t)t.hidden=true}
function refresh(){anchor=currentAnchor();build()}
function checkSelection(){
  const s=selectionSegs();
  if(!s){if(!getSelection().isCollapsed)hideTip();return}
  const rect=getSelection().getRangeAt(0).getBoundingClientRect();
  showTip('畫重點',rect,()=>{
    const e=META.toc.find(x=>x.id===view.id);
    const notes=loadNotes();
    notes.push({id:Date.now().toString(36),ch:view.id,sec:e.title,text:s.text,segs:s.segs,t:Date.now()});
    saveNotes(notes);getSelection().removeAllRanges();refresh();
  });
}
function removeNote(id){saveNotes(loadNotes().filter(n=>n.id!==id))}

/* ---------- 重點筆記面板 ---------- */
function renderNotes(){
  const order=Object.fromEntries(META.toc.map((e,i)=>[e.id,i]));
  const notes=loadNotes().sort((a,b)=>(order[a.ch]-order[b.ch])||(a.segs[0].ci-b.segs[0].ci)||(a.segs[0].s-b.segs[0].s));
  $('#nd-count').textContent=notes.length?`共 ${notes.length} 則`:'';
  const list=$('#nd-list');list.innerHTML='';
  if(!notes.length){list.innerHTML='<p class="nd-empty">還沒有重點。在內文中選取文字，按「畫重點」就會加到這裡。</p>';return}
  let sec=null;
  notes.forEach(n=>{
    if(n.sec!==sec){sec=n.sec;const h=document.createElement('h3');h.textContent=sec;list.appendChild(h)}
    const it=document.createElement('div');it.className='nd-item';
    it.innerHTML=`<blockquote>${esc(n.text)}</blockquote><div class="nd-meta"><span>${new Date(n.t).toLocaleDateString('zh-TW')}</span>
      <button data-act="go">前往</button><button data-act="del">刪除</button></div>`;
    it.querySelector('[data-act=go]').onclick=()=>{$('#notes').close();open({id:n.ch},{ci:n.segs[0].ci})};
    it.querySelector('[data-act=del]').onclick=()=>{removeNote(n.id);renderNotes();if(view.id===n.ch)refresh()};
    list.appendChild(it);
  });
}
function notesMarkdown(){
  const order=Object.fromEntries(META.toc.map((e,i)=>[e.id,i]));
  let md=`# ${META.title}・重點筆記\n`,sec=null;
  loadNotes().sort((a,b)=>(order[a.ch]-order[b.ch])||(a.segs[0].ci-b.segs[0].ci)).forEach(n=>{
    if(n.sec!==sec){sec=n.sec;md+=`\n## ${sec}\n\n`}
    md+=`> ${n.text}\n\n`;
  });
  return md;
}

/* ---------- 朗讀（Web Speech API） ---------- */
const synth=window.speechSynthesis;
const RATES=[.8,1,1.2,1.5];
const TTS={on:false,playing:false,resume:false,q:[],k:0,gen:0,u:null,voice:null,err:0,lock:null,
  rate:store.get('reader:tts',{}).rate||1};
const ttsSave=()=>store.set('reader:tts',{rate:TTS.rate,voice:TTS.voice&&TTS.voice.voiceURI});
const normLang=l=>(l||'').replace(/_/g,'-').toLowerCase();
const zhVoices=()=>synth?synth.getVoices().filter(v=>/^(zh|cmn|yue)/.test(normLang(v.lang))):[];
function pickVoice(){
  const saved=store.get('reader:tts',{}).voice;
  const rank=v=>{const l=normLang(v.lang);
    return (v.voiceURI===saved?100:0)+(/-tw$|hant/.test(l)?10:/-hk$/.test(l)?5:0)+(/natural|online/i.test(v.name)?3:0)};
  return zhVoices().sort((a,b)=>rank(b)-rank(a))[0]||null;
}
function fillVoices(){
  const sel=$('#tts-voice');if(!sel)return;
  const vs=zhVoices();
  if(!TTS.voice||!vs.includes(TTS.voice))TTS.voice=pickVoice();
  sel.innerHTML=vs.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');
  sel.hidden=!vs.length;
  if(TTS.voice)sel.value=TTS.voice.voiceURI;
}
// 切成句子：[原文位移, 要念的字]。位移以原文（含 [78]）計，和 data-o 一致；念的字才去掉來源編號
function sentences(text){
  const out=[],END='。！？；!?\n',TAIL='」』）)"”’。！？';
  const push=(a,b)=>{const t=text.slice(a,b).replace(/\[\d+\]/g,'').trim();if(t)out.push([a,t])};
  const cut=(a,b)=>{   // 過長的句子在逗號處再切，避開 Chrome 長句念到一半中斷
    while(b-a>120){
      let m=a+120;for(let j=a+120;j>a+20;j--)if('，、,：'.includes(text[j])){m=j+1;break}
      push(a,m);a=m;
    }
    push(a,b);
  };
  let s=0;
  for(let i=0;i<text.length;i++){
    if(!END.includes(text[i]))continue;
    let e=i+1;while(e<text.length&&TAIL.includes(text[e]))e++;
    cut(s,e);s=e;i=e-1;
  }
  if(s<text.length)cut(s,text.length);
  return out;
}
function ttsQueue(id){
  const q=[{ci:0,s:0,t:META.toc.find(e=>e.id===id).title,title:true}];
  CH[id].forEach((b,ci)=>sentences(b[1]||'').forEach(([s,t])=>q.push({ci,s,t})));
  return q;
}
const posOf=el=>{const f=el.querySelector('.pbody [data-ci]');return f?[+f.dataset.ci,+f.dataset.o]:null};
const before=(p,c)=>p[0]<c.ci||(p[0]===c.ci&&p[1]<=c.s);
// 這句話所在的頁：開頭位置 ≤ 這句的最後一頁
function pageFor(c){let k=-1;pageEls.forEach((el,i)=>{const p=posOf(el);if(p&&before(p,c))k=i});return k}
function visible(k){const cur=flip.getCurrentPageIndex();return k>=cur&&k<cur+(flip.getOrientation()==='landscape'?2:1)}
// 從目前看得到的頁開始念
function ttsStartIndex(){
  const cur=flip.getCurrentPageIndex();if(cur===0)return 0;
  let p=null;for(let i=cur;i<pageEls.length&&!p;i++)p=posOf(pageEls[i]);
  if(!p||(p[0]===0&&p[1]===0))return 0;
  let k=0;TTS.q.forEach((c,i)=>{if(i&&before([c.ci,c.s],{ci:p[0],s:p[1]}))k=i});
  return k;
}
function ttsMark(c){
  document.querySelectorAll('.book .tts-on').forEach(e=>e.classList.remove('tts-on'));
  if(c&&!c.title)document.querySelectorAll(`.book [data-ci="${c.ci}"]`).forEach(e=>e.classList.add('tts-on'));
}
function ttsFollow(c){
  ttsMark(c);
  if(!flip||bridging||flip.getState()!=='read')return;   // 使用者正在拖頁時不搶
  const k=pageFor(c);if(k<0||visible(k))return;
  const cur=flip.getCurrentPageIndex(),span=flip.getOrientation()==='landscape'?2:1;
  if(k>=cur+span&&k<cur+2*span)flip.flipNext();else flip.turnToPage(k);
}
function ttsSpeak(){
  const c=TTS.q[TTS.k];
  if(!c)return ttsNextChapter();
  const g=++TTS.gen;
  if(synth.speaking||synth.pending)synth.cancel();
  const u=new SpeechSynthesisUtterance(c.t);
  u.lang=TTS.voice?TTS.voice.lang:'zh-TW';if(TTS.voice)u.voice=TTS.voice;u.rate=TTS.rate;
  // cancel() 後有些瀏覽器仍會觸發舊句子的 onend/onerror，用世代編號擋掉
  u.onend=()=>{if(g!==TTS.gen)return;TTS.err=0;TTS.k++;ttsSpeak()};
  u.onerror=e=>{
    if(g!==TTS.gen||e.error==='interrupted'||e.error==='canceled')return;
    if(e.error==='not-allowed'||++TTS.err>3){TTS.err=0;ttsPause();return}
    TTS.k++;ttsSpeak();
  };
  TTS.u=u;   // 留住參考，避免 Chrome 回收後收不到 onend
  ttsFollow(c);
  synth.speak(u);
}
function ttsNextChapter(){
  const k=doneIndex(META.toc.findIndex(e=>e.id===view.id),1);
  if(k<0)return ttsStop();
  TTS.resume=true;ttsNav=true;
  open({id:META.toc[k].id},0,'next');
}
// 每次排版完成後呼叫：朗讀帶進的新章從頭念；其他重排只更新高亮
function ttsBuilt(){
  if(!TTS.on||pending)return;
  if(TTS.resume){
    TTS.resume=false;TTS.q=ttsQueue(view.id);TTS.k=0;
    if(TTS.playing)ttsSpeak();else ttsMark(TTS.q[0]);
  }else ttsMark(TTS.q[TTS.k]);
}
async function lockWake(){
  if(TTS.lock||!navigator.wakeLock)return;
  try{
    const l=await navigator.wakeLock.request('screen');
    if(!TTS.playing){l.release();return}
    TTS.lock=l;l.addEventListener('release',()=>{if(TTS.lock===l)TTS.lock=null});
  }catch(e){}
}
function unlockWake(){try{if(TTS.lock)TTS.lock.release()}catch(e){}TTS.lock=null}
function ttsUI(){
  $('#tts').hidden=!TTS.on;
  $('#tts-btn').classList.toggle('on',TTS.on);
  const p=$('#tts-play');p.textContent=TTS.playing?'❚❚':'▶';p.setAttribute('aria-label',TTS.playing?'暫停':'繼續');
  $('#tts-rate').textContent=TTS.rate+'x';
}
function ttsStart(){
  if(!synth||view.home||!flip)return;
  TTS.on=TTS.playing=true;TTS.resume=false;
  fillVoices();
  TTS.q=ttsQueue(view.id);TTS.k=ttsStartIndex();
  ttsUI();lockWake();
  ttsSpeak();   // 第一句在按鈕的 click 裡念，iPad 需要這樣才會解鎖語音
}
function ttsPause(){
  TTS.playing=false;TTS.gen++;synth.cancel();unlockWake();ttsUI();
}
function ttsPlay(){
  // 暫停期間翻到別頁，就改從目前頁開始
  const c=TTS.q[TTS.k];
  if(c&&flip&&!visible(pageFor(c)))TTS.k=ttsStartIndex();
  TTS.playing=true;ttsUI();lockWake();ttsSpeak();
}
function ttsStop(){
  if(!TTS.on)return;
  TTS.on=TTS.playing=TTS.resume=false;TTS.gen++;TTS.u=null;
  synth.cancel();unlockWake();ttsMark(null);ttsUI();
}
// 換語速或語音：從這句重念
function ttsRestart(){if(TTS.playing){TTS.gen++;synth.cancel();ttsSpeak()}}

R.start=()=>{
  document.title=META.title;
  document.body.classList.add('reader');
  document.body.innerHTML=`
<main class="stage" id="stage"><div class="msg" id="msg">排版中…</div></main>
<nav class="bar" aria-label="閱讀控制">
  <a href="../index.html" title="回書架">書架</a>
  <button id="home" title="目錄">目錄</button>
  <button id="prev" aria-label="上一頁">‹</button>
  <span class="ind" id="ind">–</span>
  <button id="next" aria-label="下一頁">›</button>
  <button id="font" title="字級">Aa</button>
  <button id="notes-btn" title="重點筆記">重點</button>
  <button id="tts-btn" title="朗讀">朗讀</button>
  <div class="tts" id="tts" hidden>
    <button id="tts-play" aria-label="暫停">❚❚</button>
    <button id="tts-rate" title="語速">1x</button>
    <select id="tts-voice" aria-label="語音"></select>
    <button id="tts-stop" aria-label="停止朗讀">✕</button>
  </div>
</nav>
<button class="tip" id="tip" hidden></button>
<dialog class="notes" id="notes" aria-labelledby="nd-title">
  <header><h2 id="nd-title">重點筆記</h2><span id="nd-count"></span>
    <button id="nd-copy">複製全部</button><button id="nd-close" aria-label="關閉">✕</button></header>
  <div class="nd-list" id="nd-list"></div>
</dialog>`;
  fsMul=FS_STEPS[store.get('reader:fs',1)]||1;
  $('#notes-btn').onclick=()=>{hideTip();renderNotes();$('#notes').showModal()};
  $('#nd-close').onclick=()=>$('#notes').close();
  $('#notes').addEventListener('click',e=>{if(e.target.id==='notes')e.target.close()});
  $('#nd-copy').onclick=async()=>{
    const b=$('#nd-copy');
    try{await navigator.clipboard.writeText(notesMarkdown());b.textContent='已複製'}
    catch(e){b.textContent='無法複製'}
    setTimeout(()=>b.textContent='複製全部',1500);
  };
  // 翻頁只在兩側感應；中間可以選字
  $('#stage').addEventListener('mousedown',gate,true);
  $('#stage').addEventListener('touchstart',gate,true);
  $('#stage').addEventListener('pointerdown',edgeDown,true);
  window.addEventListener('pointerup',edgeUp,true);
  window.addEventListener('pointercancel',()=>{edgeTap=null},true);
  $('#stage').addEventListener('mousemove',e=>{const h=e.target.closest&&e.target.closest('.book-host');if(h)h.style.cursor=edgeZone(e)?'pointer':''});
  let st;
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#tip'))hideTip()});
  document.addEventListener('selectionchange',()=>{clearTimeout(st);st=setTimeout(checkSelection,350)});
  $('#stage').addEventListener('click',e=>{
    const m=e.target.closest('mark[data-n]');
    if(m&&getSelection().isCollapsed)showTip('移除重點',m.getBoundingClientRect(),()=>{removeNote(m.dataset.n);refresh()});
  });
  if(!synth)$('#tts-btn').hidden=true;
  else{
    if('onvoiceschanged' in synth)synth.addEventListener('voiceschanged',fillVoices);
    $('#tts-btn').onclick=()=>TTS.on?(TTS.playing?ttsPause():ttsPlay()):ttsStart();
    $('#tts-play').onclick=()=>TTS.playing?ttsPause():ttsPlay();
    $('#tts-stop').onclick=ttsStop;
    $('#tts-rate').onclick=()=>{TTS.rate=RATES[(RATES.indexOf(TTS.rate)+1)%RATES.length];ttsSave();ttsUI();ttsRestart()};
    $('#tts-voice').onchange=e=>{TTS.voice=zhVoices().find(v=>v.voiceURI===e.target.value)||TTS.voice;ttsSave();ttsRestart()};
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&TTS.playing)lockWake()});
    ttsUI();
  }
  $('#home').onclick=()=>open({home:true},'toc');
  $('#prev').onclick=prev;$('#next').onclick=next;
  $('#font').onclick=()=>{
    const k=(FS_STEPS.indexOf(fsMul)+1)%FS_STEPS.length;fsMul=FS_STEPS[k];store.set('reader:fs',k);
    anchor=currentAnchor();build();
  };
  document.addEventListener('keydown',e=>{
    if($('#notes').open||e.target.tagName==='SELECT')return;
    if(e.key==='ArrowLeft')prev();if(e.key==='ArrowRight')next();
  });
  $('#stage').addEventListener('click',e=>{
    const a=e.target.closest('[data-go]');if(!a)return;
    e.preventDefault();e.stopPropagation();open({id:a.dataset.go},0,view.home?null:'next');
  },true);
  window.addEventListener('mouseup',assistFlip,true);
  window.addEventListener('touchend',assistFlip,true);
  let rt;
  new ResizeObserver(()=>{clearTimeout(rt);rt=setTimeout(()=>{
    if(!lastDims)return;   // 首次排版尚未完成；它會自己量尺寸
    const d=dims();if(`${d.pw}x${d.ph}x${d.fs}`!==lastDims){anchor=currentAnchor();build()}
  },250)}).observe($('#stage'));
  const s=store.get(key(),null);
  const ok=s&&s.view!=='home'&&META.toc.some(e=>e.id===s.view&&e.done);
  open(ok?{id:s.view}:{home:true},s?s.block:0);
};
})();
