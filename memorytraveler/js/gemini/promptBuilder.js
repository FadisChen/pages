import { contentsToPlainText } from "../utils/geminiContent.js";
import { ENDING_TYPES, TONE_OPTIONS, genderLabel, normalizeGender } from "../core/constants.js";

function buildGenderGuidance(playerGender, friendGender) {
  const player = normalizeGender(playerGender);
  const friend = normalizeGender(friendGender);
  const lines = [`玩家性別設定為「${genderLabel(player)}」；朋友性別設定為「${genderLabel(friend)}」。`];

  if (player !== "unspecified" && friend !== "unspecified") {
    lines.push(
      player === friend
        ? "兩位角色的性別設定相同，請生成同性別的玩家與朋友角色，並維持自然一致的稱謂與角色描述。"
        : "兩位角色的性別設定不同，請維持各自指定的性別與自然一致的稱謂和角色描述。"
    );
  } else {
    lines.push("任一角色選擇「不指定」時，不要強迫模型補上性別，讓名字、稱謂與角色描述保留生成彈性，但整段故事仍須前後一致。");
  }

  lines.push("性別設定只代表角色性別與稱謂，不要由此推導戀愛取向或戀愛劇情，除非故事設定明確要求。");
  return lines.join("\n");
}

export function buildRandomOutlinePrompt(tone, variationHint = "", { playerGender, friendGender } = {}) {
  const selectedTone = TONE_OPTIONS.includes(tone) ? tone : TONE_OPTIONS[2];
  return [
    "請創作一組適合繁體中文互動劇情文字遊戲的故事設定。",
    `本次唯一的故事風格／語氣主軸是「${selectedTone}」，標題、劇情大綱、朋友角色名稱與朋友個性都必須圍繞這個主軸，不能改成其他風格。`,
    "請遵守以下角色性別設定：",
    buildGenderGuidance(playerGender, friendGender),
    "劇情大綱要有清楚的世界觀、核心目標、可延伸的衝突與未解伏筆，適合長期發展；請留下可供後續探索的開口，不要直接寫出完整結局。",
    "朋友角色要能和玩家共同冒險，個性設定請具體、容易在對話中呈現。",
    variationHint ? `本次創作請優先採用這個不同於常見套路的變化方向：${variationHint}。` : "請避免使用過於常見或與前次相似的故事設定。",
    "只輸出 title、outline、friendName、friendPersona 四個欄位，符合指定 JSON schema，不要輸出 markdown 或其他說明。"
  ].join("\n");
}

export function buildSystemInstruction(outline, affinity, clues, turnNumber = 1) {
  const lines = [];
  lines.push("你是一個互動劇情文字遊戲的敘事引擎（Game Master）。");
  lines.push(`故事大綱／世界觀：${outline.outline}`);
  if (outline.title) lines.push(`故事標題：${outline.title}`);
  lines.push(`故事語氣風格：${outline.tone}`);
  lines.push(buildGenderGuidance(outline.playerGender, outline.friendGender));
  lines.push(
    `玩家在故事中有一位同行的朋友角色，名字是「${outline.friendName}」。` +
      (outline.friendPersona ? `這位朋友的個性設定：${outline.friendPersona}。` : "")
  );
  if (outline.playerName) lines.push(`請稱呼玩家為「${outline.playerName}」。`);
  lines.push(
    `玩家與「${outline.friendName}」目前的好感度為 ${affinity}/100（0代表疏遠戒備，100代表非常信任親密），請讓朋友的語氣、態度與願意透露的資訊隨好感度自然變化。`
  );
  lines.push(
    clues && clues.length
      ? `目前已知的物品／線索清單：${clues.join("；")}。之後的劇情可以呼應、使用這些項目，但不要重複生成同樣的物品或線索。`
      : "玩家目前尚未取得任何物品或線索。"
  );
  const currentTurn = Number.isInteger(turnNumber) && turnNumber > 0 ? turnNumber : 1;
  lines.push(`目前是第 ${currentTurn} 個劇情回合。這是一場沒有預設最長回合數的長篇旅程，請承接前情並自然推進。`);
  lines.push("每回合都必須提供至少一個可繼續的 choices；即使階段性事件已收束，也請留下新的探索方向。不要自行結束故事；只有玩家主動按下「結束遊戲」後才會整理回憶。");
  lines.push("規則：");
  lines.push("1. 每次回覆只推進一小段劇情（約100~220字），使用繁體中文，第二人稱或第三人稱皆可但需前後一致。");
  lines.push(
    `2. 在段落中或段落後，由朋友角色「${outline.friendName}」開口，針對當下情境給玩家 2~3 個彼此有實質差異、且會導向不同劇情走向的選項；請把朋友說的話放在 friendLine 欄位，選項放在 choices 陣列。`
  );
  lines.push("3. 玩家可能點選提供的選項，也可能直接輸入不在 choices 中的自訂行動；兩者都視為玩家在故事中的真實行動，請依故事世界觀自然判斷後果，不要要求玩家重新選擇。");
  lines.push("4. 不論劇情是否完成階段性目標，都不要自行結束故事；每回合都要讓玩家能繼續探索，並提供 choices。");
  lines.push("5. 絕對不要跳出角色、不要提及你是 AI 或這是遊戲/程式，一律以故事內的語氣輸出。");
  lines.push("6. 僅能輸出符合指定 JSON schema 的內容，不要輸出任何 markdown 或程式碼區塊符號。");
  lines.push("7. 若本回合玩家的選擇讓朋友的好感有明顯變化，請在 affinityDelta 填入 -10~10 的整數（普通選擇可填 0 或小幅變動），沒有明顯影響則填 0。");
  lines.push(
    "8. 若本回合劇情讓玩家獲得新的物品或線索，請在 newClues 陣列列出（每項 20 字以內的短語，例如「生鏽鑰匙：似乎能打開閣樓」），沒有則傳空陣列；不要重複列出已存在清單中的項目。"
  );
  return lines.join("\n");
}

export function buildCompactionPrompt(olderContents, existingSummary, { outline, affinity, clues } = {}) {
  const parts = [
    "你是互動劇情遊戲的記憶整理者。請只根據已提供的故事資料整理，不要新增未發生的事件。",
    "請將以下互動劇情遊戲「較早段落」與先前已整理的摘要，濃縮成一段300~500字、供下一回合接續的純文字摘要。",
    ""
  ];
  if (outline) {
    parts.push(
      "固定故事與角色設定（不可由摘要改寫）：",
      `故事標題：${outline.title || "未命名故事"}`,
      `故事大綱／世界觀：${outline.outline || "未提供"}`,
      `故事語氣風格：${outline.tone || "未指定"}`,
      `玩家：${outline.playerName || "玩家"}；性別：${genderLabel(outline.playerGender)}`,
      `朋友：${outline.friendName || "朋友"}；性別：${genderLabel(outline.friendGender)}；個性：${outline.friendPersona || "未指定"}`,
      ""
    );
  }
  if (Number.isFinite(affinity) || Array.isArray(clues)) {
    parts.push(
      "目前狀態錨點（以此為準，不要重新推導）：",
      Number.isFinite(affinity) ? `玩家與朋友的好感度：${affinity}/100` : "",
      Array.isArray(clues) ? `目前線索：${clues.length ? clues.join("；") : "無"}` : "",
      ""
    );
  }
  parts.push(
    "摘要必須保留：已發生事件與因果後果、目前地點與目標、玩家選擇造成的影響、角色關係與性格表現、尚未解決的線索與伏筆。",
    "固定設定與動態狀態以錨點為準；不要改變角色姓名、性別、稱謂、個性、世界觀或已確認的事件。",
    "不要把猜測寫成事實，不要自行解決伏筆或結束故事。",
    "只輸出純文字摘要本身，不要 JSON、不要 markdown、不要條列符號。",
    ""
  );
  if (existingSummary) {
    parts.push(`目前為止的既有摘要：\n${existingSummary}`, "");
  }
  parts.push(`較早段落：\n${contentsToPlainText(olderContents)}`);
  return parts.join("\n");
}

export function buildSummaryPrompt({ outline, storySummary, contents, affinity, clues }) {
  const endingTypeIds = ENDING_TYPES.map((e) => e.id);
  const parts = [`以下是一場互動劇情遊戲的經過。`, "", `故事大綱：${outline.outline}`];
  parts.push("", buildGenderGuidance(outline.playerGender, outline.friendGender));
  if (storySummary) parts.push("", `先前劇情摘要：\n${storySummary}`);
  parts.push("", `近期經過：\n${contentsToPlainText(contents)}`);
  parts.push("", `玩家與「${outline.friendName}」的最終好感度：${affinity}/100。`);
  parts.push(`已收集的物品／線索：${clues.length ? clues.join("；") : "無"}。`);
  parts.push(
    "",
    `請以「${outline.friendName}」的視角或溫馨的旁白視角，為這趟旅程寫一份回憶摘要，並列出 3~5 個精華時刻（highlights），並從以下結局類型中選出最貼切的一種填入 endingType：${endingTypeIds.join("、")}。語氣風格：${outline.tone}。使用繁體中文。`
  );
  return parts.join("\n");
}
