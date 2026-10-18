import { EFFECTS, validateEvent, dateOf, selectEvent } from './game.js';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const textSchema = maxLength => ({ type:'string', maxLength });
export const eventSchema = {
  type:'object', properties:{ title:textSchema(50), body:textSchema(700), choices:{type:'array', minItems:3, maxItems:3, items:{type:'object',properties:{label:textSchema(70),outcome:textSchema(250),effectId:{type:'string',enum:Object.keys(EFFECTS)}},required:['label','outcome','effectId']}} }, required:['title','body','choices'],
};
export function normalizeModel(model) {
  const value = model.trim().replace(/^models\//, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value)) throw new Error('請填入有效的 model name');
  return value;
}
export async function requestEvent({ apiKey, model, game, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (!apiKey?.trim()) throw new Error('請先輸入 Gemini API key');
  const id = normalizeModel(model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`, {
      method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json','x-goog-api-key':apiKey.trim()},
      body:JSON.stringify({ systemInstruction:{parts:[{text:'你是原創溫馨奇幻養成遊戲《星願手札》的事件編劇。只用臺灣繁體中文。主角莉亞10至18歲，由監護人陪伴成長。內容適齡，聚焦學習、友誼、家庭、探索與自主選擇；不包含性化、剝削、血腥或自傷細節。不模仿任何既有作品角色或劇情。依提供的核定事件改寫成自然、有細節的單一事件；保留情境、事件結果與選項順序，各選項effectId必須和原版相同，不能給予道具、稱號、金幣、勝利或新增世界設定。依JSON schema輸出單一事件，3個選項必須使用不同effectId；只回傳敘事，不設定數值。outcome為玩家選該選項之後的短結果。不要捏造過去經歷或已取得的成就。'}]}, contents:[{role:'user',parts:[{text:JSON.stringify({month:game.month+1,age:dateOf(game.month).age,calendar:dateOf(game.month),outfit:game.outfit,seed:selectEvent(game).event,stats:game.stats,plan:game.plan,recent:game.history.slice(0,3).map(h=>({title:h.title,choice:h.choice})),effects:Object.fromEntries(Object.entries(EFFECTS).map(([k,v])=>[k,v.label]))})}]}], generationConfig:{temperature:0.85,maxOutputTokens:4096,responseMimeType:'application/json',responseJsonSchema:eventSchema} }),
    });
    if (!response.ok) throw new Error(({400:'模型不支援此請求或設定有誤',401:'API key 驗證失敗',403:'API key 權限不足或地區不支援',404:'找不到此模型，請確認 model name',429:'已達速率或配額限制，請稍後再試'}[response.status]) || `Gemini 暫時無法服務（HTTP ${response.status}）`);
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new Error('事件未完整生成或遭內容過濾，請重試或使用內建事件');
    const raw = candidate.content?.parts?.filter(p=>!p.thought).map(p=>p.text || '').join('') || '';
    if (raw.length > 12000) throw new Error('事件回應過長');
    return validateEvent(JSON.parse(raw));
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('連線超過30秒，進度尚未扣款，請稍後再試');
    if (err instanceof SyntaxError) throw new Error('Gemini 回應無法解析，請重試或使用內建事件');
    if (err instanceof TypeError) throw new Error('無法連線至 Gemini，請檢查網路或使用內建事件');
    throw err;
  } finally { clearTimeout(timeout); }
}
