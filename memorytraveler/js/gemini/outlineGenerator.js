import { generateContent } from "./client.js";
import { buildRandomOutlinePrompt } from "./promptBuilder.js";
import { parseOutlineResponse } from "./responseValidators.js";
import { buildOutlineSchema } from "../core/constants.js";
import { extractResponseText, userContent } from "../utils/geminiContent.js";

const VARIATION_HINTS = Object.freeze([
  "把地方傳說與角色的日常任務交織在一起",
  "以一個明確的倒數時限與不可逆選擇推進故事",
  "讓兩位角色各自隱瞞一個會改變真相的秘密",
  "從一件失落物品延伸出跨世代的謎團",
  "讓自然環境或城市本身像角色一樣回應玩家",
  "從看似平凡的小事逐步揭露更大的真相",
  "以不可靠的記憶或多重視角製造懸念",
  "把旅伴之間逐漸建立的信任作為情感主線"
]);

function pickVariationHint() {
  return VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];
}

export async function generateRandomOutline(
  apiKey,
  model,
  tone,
  { playerGender, friendGender, generateContentFn = generateContent } = {}
) {
  const response = await generateContentFn(apiKey, model, {
    contents: [userContent(buildRandomOutlinePrompt(tone, pickVariationHint(), { playerGender, friendGender }))],
    generationConfig: {
      temperature: 1.3,
      responseMimeType: "application/json",
      responseSchema: buildOutlineSchema()
    }
  });
  return parseOutlineResponse(extractResponseText(response));
}
