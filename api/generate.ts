import { GoogleGenAI, Type } from "@google/genai";

// 定義完整的 JSON 結構 schema
const summaryResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "基於本影音或內容，自動生成的主題或最切合的標題 (必填)",
    },
    summary: {
      type: Type.STRING,
      description: "150-250字的流暢繁體中文概要，要能提綱挈領說明本內容的宗旨與意圖 (必填)",
    },
    timeline: {
      type: Type.ARRAY,
      description: "本內容或影音循序漸進的時間軸摘要，如果有明確秒數，請務必精準標記(例如 00:15)，若無可概略估算(例如 00:00, 01:30等) (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING, description: "時間標記, 格式必須如 MM:SS 或 HH:MM:SS" },
          title: { type: Type.STRING, description: "此項目的精炼大綱主題" },
          description: { type: Type.STRING, description: "該段落主要談論細節、要點概要" },
        },
        required: ["time", "title", "description"],
      },
    },
    mindmap: {
      type: Type.ARRAY,
      description: "基於本內容的階層式樹狀重點大綱，最多支持3層巢狀結構，用於生成心智圖等級的心得 (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1'" },
          label: { type: Type.STRING, description: "一級核心主題名稱" },
          children: {
            type: Type.ARRAY,
            description: "二級核心重點",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1-1'" },
                label: { type: Type.STRING, description: "二級核心重點名稱" },
                children: {
                  type: Type.ARRAY,
                  description: "三級關鍵細節",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1-1-1'" },
                      label: { type: Type.STRING, description: "三級關鍵細節描述" },
                    },
                    required: ["id", "label"],
                  },
                },
              },
              required: ["id", "label"],
            },
          },
        },
        required: ["id", "label"],
      },
    },
    insights: {
      type: Type.ARRAY,
      description: "影音或內容中的關鍵觀點與金句 quote (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          point: { type: Type.STRING, description: "核心論點或啟發" },
          quote: { type: Type.STRING, description: "對應的精闢金句或原話重現/總結" },
        },
        required: ["point", "quote"],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      description: "本影音提出的下一步行動、可實踐的目標指引 e.g. 會議行動、學習任務等 (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING, description: "具體的行動任務" },
          reason: { type: Type.STRING, description: "做此任務的原因、關鍵價值與建議落實方式" },
        },
        required: ["task", "reason"],
      },
    },
    keywords: {
      type: Type.ARRAY,
      description: "本內容的主題關鍵字列表，5-8個 (必填)",
      items: {
        type: Type.STRING,
      },
    },
  },
  required: ["title", "summary", "timeline", "mindmap", "insights", "actionItems", "keywords"],
};

// 輔助函式：將 Gemini AI 錯誤訊息轉化為對用戶溫暖、友善且具體指引的繁體中文內容
function formatError(error: any, defaultMsg: string): string {
  const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
  
  if (
    errMsg.includes("429") || 
    errMsg.includes("RESOURCE_EXHAUSTED") || 
    errMsg.includes("quota") || 
    errMsg.includes("Rate Limit Exceeded") ||
    errMsg.includes("limit") ||
    errMsg.includes("exhausted")
  ) {
    return "⚠️ 系統分析額度/頻率已達限制 (Resource Exhausted - 429)\n\n目前您連結專案的 API 免費額度或每分鐘發送的請求頻率已暫時到達上限。\n\n💡 建議排解與使用管道：\n1. 請您稍等 30 至 60 秒後，再次點擊送出即可成功恢復正常分析。\n2. 如果是 Gemini 額度問題，可至 Google AI Studio 面板檢查 API 金鑰的使用狀態。";
  }
  
  if (
    errMsg.includes("API key not valid") || 
    errMsg.includes("API_KEY_INVALID") || 
    errMsg.includes("API key") || 
    errMsg.includes("Key not found") ||
    errMsg.includes("401") ||
    errMsg.includes("Unauthorized")
  ) {
    return "⚠️ API 金鑰設定無效或尚未配置\n\n系統未能驗證您的 API 金鑰。請確認您的 .env 環境設定中是否已指派對應的 `GEMINI_API_KEY` 或 `NVIDIA_API_KEY`。";
  }
  
  if (
    errMsg.includes("blocked") || 
    errMsg.includes("safety") || 
    errMsg.includes("SAFETY") ||
    errMsg.includes("block")
  ) {
    return "⚠️ 內容觸發安全過濾攔截\n\n由於目前貼上的影音內容或原文字稿符合敏感字詞安全性過濾規範，故被 AI 官方安全機制予以過濾。請嘗試上傳或貼上其他主題的素材重試。";
  }
  
  return errMsg || defaultMsg;
}

// 輔助函式：指數型退避重試
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
    const isRateLimit = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("exhausted");
    if (retries > 0 && isRateLimit) {
      console.warn(`[AI API] 遭遇 429/過載。將於 ${delay}ms 後重新嘗試... 剩餘嘗試次數: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// 解析 JSON 內容：處理 NVIDIA 推理模型 <think> 區塊、Markdown 程式碼區塊、以及文字混雜的情況
function parseJSONResponse(text: string): any {
  let cleaned = text.trim();

  // 1. 移除 NVIDIA 推理模型的 <think>...</think> 思考區塊
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 2. 移除 Markdown 程式碼區塊標記 (```json ... ``` 或 ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 3. 嘗試直接解析
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
    return parsed;
  } catch (_e) {
    // 解析失敗，嘗試從文本中提取 JSON 物件或陣列
  }

  // 4. 嘗試尋找第一個完整的 JSON 物件 {...} 或陣列 [...]
  const jsonStart = cleaned.search(/[\[{]/);
  if (jsonStart === -1) {
    throw new Error("回應中未包含有效的 JSON 資料");
  }

  const startChar = cleaned[jsonStart];
  const endChar = startChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = jsonStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) {
        const jsonStr = cleaned.substring(jsonStart, i + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0];
        }
        return parsed;
      }
    }
  }

  throw new Error("無法從 AI 回應中擷取完整的 JSON 結構");
}

// 初始化 Gemini AI 客戶端
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Vercel Serverless Function 入口
export default async function handler(req: any, res: any) {
  // 僅支援 POST 請求
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { 
      provider = "gemini", 
      action = "summarize", 
      // Summarize parameters
      type, 
      transcript, 
      fileName, 
      fileBase64, 
      mimeType,
      // Translate parameters
      summaryData,
      targetLanguage,
      // Chat parameters
      chatHistory,
      userMessage
    } = req.body;

    // 檢查 API 金鑰
    const geminiKey = process.env.GEMINI_API_KEY;
    const nvidiaKey = process.env.NVIDIA_API_KEY;

    if (provider === "gemini" && !geminiKey) {
      return res.status(400).json({ error: "未在環境變數中設定 GEMINI_API_KEY" });
    }
    if (provider === "nvidia" && !nvidiaKey) {
      return res.status(400).json({ error: "未在環境變數中設定 NVIDIA_API_KEY" });
    }

    // 1. 處理 Gemini
    if (provider === "gemini") {
      // ==========================================
      // ACTION: SUMMARIZE
      // ==========================================
      if (action === "summarize") {
        let promptText = "";
        let contents: any[] = [];

        if (type === "text" || type === "transcript") {
          if (!transcript || transcript.trim() === "") {
            return res.status(400).json({ error: "影音逐字稿內容為空" });
          }
          promptText = `
你是一位專業多語系影音資訊與影片整理人。請仔細閱讀以下影音逐字稿或字幕內容，提供一份精練的繁體中文結構化重點整理。

要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各欄位。
- 依據影片內容脈絡，合理估算並生成時間軸摘要。
- 生成 150-250 字的摘要說明。
- 建立最高 3 層的心智大綱 (mindmap)，以 id (m1, m1-1, m1-1-1) 劃分。
- 提煉出關鍵觀點與金句 (insights)。
- 列出行動清單 (actionItems)。
- 提取 5-8 個關鍵字 (keywords)。
- 務必回傳符合 JSON 格式的字串，不要輸出額外的說明文字。
--- 內容開始 ---
${transcript}
--- 內容結束 ---
`;
          contents = [promptText];
        } else if (type === "link") {
          if (!transcript || transcript.trim() === "") {
            return res.status(400).json({ error: "網址連結不能為空" });
          }
          promptText = `
你是一位專業的多語系影音內容深度分析大師，擅長從各類網路資源中提取核心價值。

【用戶提供的URL】：${transcript}

【您的任務分階段執行】：

第一優先級 - 搜索最完整的原始內容：
1. 若為 YouTube 連結，務必搜索：
   - YouTube 官方逐字稿 (YouTube transcript/closed captions)
   - 視頻章節摘要
   - 視頻評論中的高質量總結
   - 相關字幕下載資源
2. 若為其他網媒連結，搜索：
   - 原文全文內容
   - 摘要或簡介
   - 作者評論
   - 相關討論或評論

第二優先級 - 基礎信息蒐集（若無法獲得完整逐字稿）：
- 標題、作者、發布日期
- 官方描述或簡介
- 重要評論或摘要
- 相關主題或分類

第三優先級 - 分析與結構化：
1. 基於搜索結果生成分析
2. **重要**：若搜索只取得部分信息（如無完整逐字稿），必須在摘要開頭註明：
   「⚠️ 本分析基於可取得的標題、描述、評論等信息，未獲得完整逐字稿」
3. 避免虛構、猜測或編造未出現在搜索結果中的內容

【輸出要求 - 繁體中文】：
- 摘要：150-250 字，精確反映內容核心
- 時間軸：若有明確時間戳，精確標記（MM:SS）；若無，可省略或估算
- 心智圖：3 層最多，id 格式：m1, m1-1, m1-1-1
- 金句：必須直接引用或改述自搜索結果，不要編造
- 行動項：基於內容邏輯推導，保證可行性
- 關鍵字：5-8 個，體現主題

【輸出格式 - 純 JSON】（不加任何 markdown、說明或額外文字）：
{
  "title": "根據搜索結果的準確標題",
  "summary": "基於可取得信息的 150-250 字繁體中文摘要",
  "timeline": [
    { "time": "00:00", "title": "段落標題", "description": "段落內容概要" }
  ],
  "mindmap": [
    {
      "id": "m1",
      "label": "一級主題",
      "children": [
        {
          "id": "m1-1",
          "label": "二級主題",
          "children": [
            { "id": "m1-1-1", "label": "三級細節" }
          ]
        }
      ]
    }
  ],
  "insights": [
    { "point": "核心觀點", "quote": "原文引用或改述" }
  ],
  "actionItems": [
    { "task": "行動任務", "reason": "任務原因與建議" }
  ],
  "keywords": ["關鍵字1", "關鍵字2"]
}
`;
          contents = [promptText];
        } else if (type === "media" || type === "file" || type === "recording") {
          if (!fileBase64 || !mimeType) {
            return res.status(400).json({ error: "缺少媒體檔案資料或 MimeType" });
          }

          const mediaPart = {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          };

          promptText = `
幕前音訊/影片整理與翻譯大師。
你是一位頂級的語音、影片智能分析大師。
現在，使用者上傳了一個影音文件 (檔名：${fileName || "未命名影音"})。
請你仔細讀取並分析這份影音中的語音和視覺內容，進行頂級的繁體中文重點整理。
如果該影音非中文（如英文、日文、韓文等），請你先聽懂/理解內容，然後直接用「繁體中文 (Traditional Chinese)」做完美的重點歸納。
要求：
- 自動生成最適切的「標題」。
- 用 150-250 字說明「摘要」。
- 分析語音或影片畫面中各章節或說話亮點出現的實際「時間軸」，給出時間標記與論述。
- 生成樹狀心智大綱 (mindmap)，以 id (m1, m1-1, m1-1-1) 完美劃分 3 層階層。
- 提煉「關鍵啟發與金句」 (insights).
- 建立具實操價值的「行動指標」 (actionItems).
- 生成代表性的關鍵字 (keywords).
`;
          contents = [mediaPart, promptText];
        } else {
          return res.status(400).json({ error: "不支援的處理類型" });
        }

        const isLinkType = type === "link";

        const response = await retryWithBackoff(() => ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: contents,
          config: {
            systemInstruction: "你是一個專業多國語文音訊與影片分析整理機器人。本質上，你擅長聆聽各類影音的多媒體封包與文字，並轉換成最精緻結構化的繁體中文 JSON 分類。",
            temperature: 0.2,
            ...(isLinkType
              ? { tools: [{ googleSearch: {} }] }
              : { responseMimeType: "application/json", responseSchema: summaryResponseSchema }
            )
          },
        }));

        // 從 Gemini 回應中提取文字內容
        let textResult = response.text;
        if (!textResult) {
          // 嘗試從 candidates 中提取
          const candidates = (response as any).candidates;
          if (candidates && candidates[0]?.content?.parts) {
            const parts = candidates[0].content.parts;
            const textParts = parts
              .filter((p: any) => p.text)
              .map((p: any) => p.text);
            if (textParts.length > 0) {
              textResult = textParts.join("\n");
            }
          }
        }

        if (!textResult) {
          console.error("[Gemini Summarize] 完整回應結構:", JSON.stringify(response, null, 2).substring(0, 2000));
          throw new Error("⚠️ Gemini 未能產出有效回應。可能原因：\n1. 網址無法存取或被限制\n2. Google 搜尋無法取得該內容\n\n💡 建議：請改用【✍️ 貼上字稿】功能，手動複製 YouTube 官方逐字稿後貼上，這樣可以確保 100% 準確的分析。");
        }

        console.log("[Gemini Summarize] 原始回應前 300 字:", textResult.substring(0, 300));
        const parsedJson = parseJSONResponse(textResult);
        return res.json(parsedJson);
      }

      // ==========================================
      // ACTION: TRANSLATE
      // ==========================================
      if (action === "translate") {
        if (!summaryData) {
          return res.status(400).json({ error: "缺少要翻譯的整理資料 (summaryData)" });
        }
        if (!targetLanguage) {
          return res.status(400).json({ error: "未指定翻譯目標語言 (targetLanguage)" });
        }

        let targetLangDesc = "繁體中文 (Traditional Chinese)";
        if (targetLanguage === "en") targetLangDesc = "英文 (English)";
        else if (targetLanguage === "ja") targetLangDesc = "日文 (Japanese)";
        else if (targetLanguage === "ko") targetLangDesc = "韓文 (Korean)";
        else if (targetLanguage === "zh-tw") targetLangDesc = "繁體中文 (Traditional Chinese)";

        const promptText = `
你是一位頂級的多國語言翻譯家與重點剖析師。
請將以下輸入的 JSON 重點整理資料中的「所有文字內容」完美翻譯成：【${targetLangDesc}】。
請注意：
- 務必在翻譯後保持與原來「完全一致的 JSON 架構」，所有 Key 必須保留，其 id (心智圖的 id 等如 m1) 絕對不能變更或翻譯。
- 翻譯時要講求信、雅、達，若包含專業術語，請採用該語言最常用、最典雅的自然表達。
- Timeline 的 time 標記維持格式，其 title 與 description 要翻譯。
- Mindmap 的 label 要翻譯。
- Insights 的 point 與 quote 都要翻譯。
- ActionItems 的 task 與 reason 都要翻譯。
- Keywords 的字詞列表都要翻譯。

輸入的 JSON 內容如下：
${JSON.stringify(summaryData, null, 2)}
`;

        const response = await retryWithBackoff(() => ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: promptText,
          config: {
            systemInstruction: `你是一個專業翻譯程序，負責將特定的結構化 JSON 按原格式精準翻譯成指定語言：${targetLangDesc}。不要修改 JSON 中的 Key。`,
            responseMimeType: "application/json",
            responseSchema: summaryResponseSchema,
            temperature: 0.1,
          },
        }));

        const textResult = response.text;
        if (!textResult) {
          throw new Error("Gemini AI 翻譯回應失敗");
        }

        const parsedJson = JSON.parse(textResult.trim());
        return res.json(parsedJson);
      }

      // ==========================================
      // ACTION: CHAT
      // ==========================================
      if (action === "chat") {
        if (!userMessage || userMessage.trim() === "") {
          return res.status(400).json({ error: "訊息內容不能為空" });
        }

        const formattedContents: any[] = [];
        formattedContents.push({
          role: "user",
          parts: [
            {
              text: `
你是本影片的智能 AI 問答助手。這部影音的逐字稿/主題內容如下：
--- 影音內容背景 ---
${transcript || "無提供特定內容，請以常識跟助理邏輯回答。"}
--- 影音內容背景結束 ---

請基於這部影音所談論的事實、亮點與觀點，有深度、熱情、客觀地回答使用者的提問。若影音中沒有直接談及，也可以結合你的知識庫，但要特別說明「影片中並非主要提及，但補充如下...」。
一律使用「繁體中文」回答。
`,
            },
          ],
        });

        if (chatHistory && Array.isArray(chatHistory)) {
          chatHistory.forEach((msg: any) => {
            formattedContents.push({
              role: msg.role === "user" ? "user" : "model",
              parts: [{ text: msg.content || msg.question || "" }],
            });
          });
        }

        formattedContents.push({
          role: "user",
          parts: [{ text: userMessage }],
        });

        const response = await retryWithBackoff(() => ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: formattedContents,
          config: {
            systemInstruction: "你是一個附屬於影片摘要工具的 AI 專屬互動解答助理，專長是以繁體中文就一部影片的細節進行極深度解答、觀點拓展與實踐方法擴充。",
            temperature: 0.7,
          },
        }));

        const answer = response.text || "助理目前似乎無法回答，請稍候再試。";
        return res.json({ answer });
      }
    }

    // 2. 處理 NVIDIA NIM
    if (provider === "nvidia") {
      // ==========================================
      // ACTION: SUMMARIZE
      // ==========================================
      if (action === "summarize") {
        // NVIDIA 不支援多媒體與連結抓取
        if (type === "media" || type === "file" || type === "recording") {
          return res.status(400).json({ 
            error: "⚠️ NVIDIA NIM (nemotron-3-nano-omni-30b-a3b-reasoning) 為純文字模型，不支援直接分析語音或影片檔案。\n\n💡 請切換為 Google Gemini 引擎，或使用「貼上字稿」方式，將影音逐字稿貼上後由 NVIDIA 處理。" 
          });
        }
        if (type === "link") {
          return res.status(400).json({ 
            error: "⚠️ NVIDIA NIM (nemotron-3-nano-omni-30b-a3b-reasoning) 不支援網路搜尋與影音連結抓取。\n\n💡 請切換為 Google Gemini 引擎以啟動搜尋工具，或使用「貼上字稿」將字幕貼上後分析。" 
          });
        }

        if (!transcript || transcript.trim() === "") {
          return res.status(400).json({ error: "逐字稿內容不能為空" });
        }

        const systemInstruction = `你是一個專業多國語文音訊與影片分析整理機器人。本質上，你擅長聆聽各類影音的文字，並轉換成最精緻結構化的繁體中文 JSON。你必須回傳一個完全符合以下 JSON 格式要求的字串，不要輸出額外的 markdown 程式碼區塊標記或任何說明文字。

JSON Schema 格式範例：
{
  "title": "主題標題",
  "summary": "150-250字的繁體中文概要說明",
  "timeline": [
    { "time": "00:00", "title": "段落大綱", "description": "該段落主要談論細節、要點概要" }
  ],
  "mindmap": [
    { 
      "id": "m1", 
      "label": "一級核心主題", 
      "children": [
        { 
          "id": "m1-1", 
          "label": "二級核心重點", 
          "children": [
            { "id": "m1-1-1", "label": "三級關鍵細節描述" }
          ] 
        }
      ] 
    }
  ],
  "insights": [
    { "point": "核心觀點", "quote": "對應的金句或原話" }
  ],
  "actionItems": [
    { "task": "具體行動任務", "reason": "做此任務的原因、價值與建議" }
  ],
  "keywords": ["關鍵字1", "關鍵字2"]
}`;

        const promptText = `
請針對以下影音的「逐字稿、字幕、或文字逐字記錄」內容，進行抽絲剝繭的思考與整理，並僅輸出上述格式要求的繁體中文 JSON 內容：
--- 內容開始 ---
${transcript}
--- 內容結束 ---
`;

        const response = await retryWithBackoff(() => fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "nvidia/llama-3.1-405b-instruct",
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: promptText }
            ],
            temperature: 0.2
          })
        }));

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`NVIDIA API 回傳錯誤: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const textResult = data.choices?.[0]?.message?.content;
        if (!textResult) {
          throw new Error("NVIDIA NIM 未能產出有效的回應");
        }

        const parsedJson = parseJSONResponse(textResult);
        return res.json(parsedJson);
      }

      // ==========================================
      // ACTION: TRANSLATE
      // ==========================================
      if (action === "translate") {
        if (!summaryData) {
          return res.status(400).json({ error: "缺少要翻譯的整理資料 (summaryData)" });
        }
        if (!targetLanguage) {
          return res.status(400).json({ error: "未指定翻譯目標語言 (targetLanguage)" });
        }

        let targetLangDesc = "繁體中文 (Traditional Chinese)";
        if (targetLanguage === "en") targetLangDesc = "英文 (English)";
        else if (targetLanguage === "ja") targetLangDesc = "日文 (Japanese)";
        else if (targetLanguage === "ko") targetLangDesc = "韓文 (Korean)";
        else if (targetLanguage === "zh-tw") targetLangDesc = "繁體中文 (Traditional Chinese)";

        const systemInstruction = `你是一個專業翻譯程序，負責將特定的結構化 JSON 按原格式精準翻譯成指定語言：${targetLangDesc}。
請注意：
- 務必在翻譯後保持與原來「完全一致的 JSON 架構」，所有 Key 必須保留，其 id (心智圖的 id 等如 m1) 絕對不能變更或翻譯。
- 翻譯時要講求信、雅、達，若包含專業術語，請採用該語言最常用、最典雅的自然表達。
- 不要輸出任何 markdown 程式碼區塊標記（如 \`\`\`json 等）或任何額外字眼，僅回傳符合 JSON schema 的純字串。`;

        const promptText = `
請將以下輸入的 JSON 重點整理資料中的「所有文字內容」完美翻譯成：【${targetLangDesc}】。

輸入的 JSON 內容如下：
${JSON.stringify(summaryData, null, 2)}
`;

        const response = await retryWithBackoff(() => fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "nvidia/llama-3.1-405b-instruct",
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: promptText }
            ],
            temperature: 0.1
          })
        }));

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`NVIDIA API 回傳錯誤: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const textResult = data.choices?.[0]?.message?.content;
        if (!textResult) {
          throw new Error("NVIDIA NIM 翻譯回應失敗");
        }

        const parsedJson = parseJSONResponse(textResult);
        return res.json(parsedJson);
      }

      // ==========================================
      // ACTION: CHAT
      // ==========================================
      if (action === "chat") {
        if (!userMessage || userMessage.trim() === "") {
          return res.status(400).json({ error: "訊息內容不能為空" });
        }

        const systemInstruction = "你是一個附屬於影片摘要工具的 AI 專屬互動解答助理，專長是以繁體中文就一部影片的細節進行極深度解答、觀點拓展與實踐方法擴充。";

        const messages: any[] = [
          {
            role: "system",
            content: `${systemInstruction}\n\n這部影音的逐字稿/主題內容如下：\n--- 影音內容背景 ---\n${transcript || "無提供特定內容，請以常識跟助理邏輯回答。"}\n--- 影音內容背景結束 ---\n\n請基於這部影音所談論的事實、亮點與觀點，有深度、熱情、客觀地回答使用者的提問。若影音中沒有直接談及，也可以結合你的知識庫，但要特別說明「影片中並非主要提及，但補充如下...」。一律使用「繁體中文」回答。`
          }
        ];

        if (chatHistory && Array.isArray(chatHistory)) {
          chatHistory.forEach((msg: any) => {
            messages.push({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.content || msg.question || ""
            });
          });
        }

        messages.push({
          role: "user",
          content: userMessage
        });

        const response = await retryWithBackoff(() => fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "nvidia/llama-3.1-405b-instruct",
            messages: messages,
            temperature: 0.7
          })
        }));

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`NVIDIA API 回傳錯誤: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || "助理目前似乎無法回答，請稍候再試。";
        return res.json({ answer });
      }
    }

    return res.status(400).json({ error: "不支援的提供商或操作行為" });

  } catch (error: any) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: formatError(error, "處理請求時發生異常錯誤，請確認 API 密鑰配置與格式"),
    });
  }
}
