document.querySelectorAll('.bk-c[data-book]').forEach(book => {
  try {
    const saved = JSON.parse(localStorage.getItem('reader:' + book.dataset.book));
    if (!saved || !saved.view || saved.view === 'home') return;
    book.querySelector('.bk-status').textContent = saved.title ? '接續閱讀 · ' + saved.title : '接續閱讀';
  } catch (e) {}
});

const keyDialog=document.querySelector('#gemini-key-dialog');
const keyInput=document.querySelector('#gemini-key-input');
const keyState=document.querySelector('#gemini-key-state');
const voiceSelect=document.querySelector('#gemini-voice');
function updateKeyState(){keyState.textContent=localStorage.getItem('gemini:api-key')?'API KEY 已設定':'尚未設定'}
updateKeyState();
document.querySelector('#gemini-key-open').onclick=()=>{keyInput.value='';voiceSelect.value=localStorage.getItem('gemini:voice')||'Puck';keyDialog.showModal();keyInput.focus()};
document.querySelector('#gemini-key-cancel').onclick=()=>keyDialog.close();
document.querySelector('#gemini-key-remove').onclick=()=>{localStorage.removeItem('gemini:api-key');keyInput.value='';updateKeyState();keyInput.focus()};
document.querySelector('#gemini-key-form').onsubmit=e=>{
  e.preventDefault();
  const key=keyInput.value.trim();
  if(!key&&!localStorage.getItem('gemini:api-key')){keyInput.focus();return}
  if(key)localStorage.setItem('gemini:api-key',key);
  localStorage.setItem('gemini:voice',voiceSelect.value);
  keyInput.value='';updateKeyState();keyDialog.close();
};
