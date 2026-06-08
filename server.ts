/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// 載入環境變數
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 設定較大 body 限制以支援前端上傳語音/影片 Base64
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// 初始化 Gemini AI SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

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
function formatGeminiError(error: any, defaultMsg: string): string {
  const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
  
  if (
    errMsg.includes("429") || 
    errMsg.includes("RESOURCE_EXHAUSTED") || 
    errMsg.includes("quota") || 
    errMsg.includes("Rate Limit Exceeded") ||
    errMsg.includes("limit") ||
    errMsg.includes("exhausted")
  ) {
    return "⚠️ 系統分析額度/頻率已達限制 (Resource Exhausted - 429)\n\n目前您連結專案的 Gemini API 免費額度或每分鐘發送的請求頻率已暫時到達上限。\n\n💡 建議排解與使用管道：\n1. 請您稍等 30 至 60 秒後，再次點擊送出即可成功恢復正常分析。\n2. 如果您在 AI Studio 主控台中頻繁使用，可至 Google AI Studio 面板檢查 API 金鑰的使用狀態，或綁定信用卡開啟 Pay-as-you-go 方案以完全解除頻率配額限制。";
  }
  
  if (
    errMsg.includes("API key not valid") || 
    errMsg.includes("API_KEY_INVALID") || 
    errMsg.includes("API key") || 
    errMsg.includes("Key not found")
  ) {
    return "⚠️ API 金鑰設定無效或尚未配置\n\n系統未能驗證您的 API 金鑰。請確認您的 .env 環境設定中是否已指派 `GEMINI_API_KEY`，或是前往專案設定面板重新填寫正確的金鑰。";
  }

  if (
    errMsg.includes("blocked") || 
    errMsg.includes("safety") || 
    errMsg.includes("SAFETY") ||
    errMsg.includes("block")
  ) {
    return "⚠️ 內容觸發安全過濾攔截\n\n由於目前貼上的影音內容或原文字稿符合敏感字詞安全性過濾規範，故被 Google Gemini 官方安全機制予以過濾。請嘗試上傳或貼上其他主題的素材重試。";
  }

  return errMsg || defaultMsg;
}

// 輔助函式：當遭遇 Gemini API 頻率限制 (429) 時進行指數型退避重試
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
    const isRateLimit = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("exhausted");
    if (retries > 0 && isRateLimit) {
      console.warn(`[Gemini API] 遭遇 429/過載。將於 ${delay}ms 後重新嘗試... 剩餘嘗試次數: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// API: 影音智慧彙整重點與心智圖、時間軸、工作清單等 (Summarize Endpoint)
app.post("/api/summarize", async (req, res) => {
  try {
    const { type, transcript, fileName, fileBase64, mimeType } = req.body;

    let promptText = "";
    let contents: any[] = [];

    if (type === "transcript" || type === "text") {
      // 純逐字稿文字處理
      if (!transcript || transcript.trim() === "") {
        return res.status(400).json({ error: "逐字稿內容不能為空" });
      }
      promptText = `
你是一位頂級的影音重點整理與學習大師。
請針對以下影音的「逐字稿、字幕、或文字逐字記錄」內容，進行抽絲剝繭的深度思考與整理。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各欄位。
- 提取最吸睛且代表性的「標題」。
- 整理出一個具有宏觀視野的「概要摘要」(summary)。
- 建立條理清晰的「時間軸摘要」，在其中各事件必須附上時間點，如果文字中沒有提及精密時間，可合理估算例如 '00:00' 開始。
- 建立最高 3 層的「階層式大綱 (mindmap)」，以利前台渲染樹狀圖。其 id 生成請用 m1, m1-1, m1-2... 等。
- 提煉出讓人能得到啟發與激勵的「關鍵觀點與金句 (insights)」。
- 列出具有落地可行性的「行動清單 (actionItems)」，幫助讀者在吸收後能進行實踐。
- 提取 5-8 個「主題關鍵字 (keywords)」。

--- 內容開始 ---
${transcript}
--- 內容結束 ---
`;
      contents = [promptText];
    } else if (type === "link") {
      // 影音/網頁連結處理
      if (!transcript || transcript.trim() === "") {
        return res.status(400).json({ error: "網址連結不能為空" });
      }
      promptText = `
你是一位頂級的影音網址與線上媒體智能分析大師。
現在，使用者提供了一個線上影音/網址連結：【${transcript}】。
請你使用內建的 Google 搜尋，認真檢索、了解並抓取該連結對應的詳細音訊內容、公開逐字資訊、分段介紹或相關背景資料。
然後，做一次堪稱完美且高水準的繁體中文重點整理。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各欄位。
- 依據影片具體脈絡，合理估算並生成一組包含時間標記項目（格式如 MM:SS）的循序漸進「時間軸摘要」。
- 生成 150-250 字的「摘要」說明。
- 建立最高 3 層的「階層式大綱 (mindmap)」，其 id 生成請用 m1, m1-1, m1-2... 等。
- 提煉出讓人能得到啟發與激勵的「關鍵觀點與金句 (insights)」。
- 列出高度可操作性與實踐指導意義的「行動清單 (actionItems)」。
- 提取富有主題代表性的 5-8 個「關鍵字 (keywords)」。
`;
      contents = [promptText];
    } else if (type === "media" || type === "file" || type === "recording") {
      // 影音多媒體檔案處理
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
你是一位頂級的語音、影片智能分析大師。
現在，使用者上傳了一個影音文件 (檔名：${fileName || "未命名影音"})。
請你仔細讀取並分析這份影音中的語音和視覺內容，進行頂級的繁體中文重點整理。
如果該影音非中文（如英文、日文、韓文等），請你先聽懂/理解內容，然後直接用「繁體中文 (Traditional Chinese)」做完美的重點歸納。
要求：
- 自動生成最適切的「標題」。
- 用 150-250 字說明「摘要」。
- 分析語音或影片畫面中各章節或說話亮點出現的實際「時間軸」，給出時間標記與論述。
- 生成樹狀心智大綱 (mindmap)，以 id (m1, m1-1, m1-1-1) 完美劃分 3 層階層。
- 提煉「關鍵啟發與金句」 (insights)。
- 建立具實操價值的「行動指標」 (actionItems)。
- 生成代表性的關鍵字 (keywords)。
`;
      contents = [mediaPart, promptText];
    } else {
      return res.status(400).json({ error: "不支援的處理類型" });
    }

    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: "你是一個專業多國語文音訊與影片分析整理機器人。本質上，你擅長聆聽各類影音的多媒體封包與文字，並轉換成最精緻結構化的繁體中文 JSON 分類。",
        responseMimeType: "application/json",
        responseSchema: summaryResponseSchema,
        temperature: 0.2, // 降低溫度提高 JSON 回傳結構穩定度
        ...(type === "link" ? { tools: [{ googleSearch: {} }] } : {})
      },
    }));

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Gemini AI 未能產出有效的回應");
    }

    const parsedJson = JSON.parse(textResult.trim());
    return res.json(parsedJson);

  } catch (error: any) {
    console.error("summarize error:", error);
    return res.status(500).json({
      error: formatGeminiError(error, "處理影音整理時發生異常錯誤，請確認 API 密鑰與格式正確"),
    });
  }
});

// API: 翻譯已整理好的資料 (Translate Summary Data)
app.post("/api/translate", async (req, res) => {
  try {
    const { summaryData, targetLanguage } = req.body;

    if (!summaryData) {
      return res.status(400).json({ error: "缺少要翻譯的整理資料 (summaryData)" });
    }

    if (!targetLanguage) {
      return res.status(400).json({ error: "未指定翻譯目標語言 (targetLanguage)" });
    }

    // 將目標語言映射為人類易懂指令
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
      model: "gemini-3.5-flash",
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

  } catch (error: any) {
    console.error("translate error:", error);
    return res.status(500).json({
      error: formatGeminiError(error, "翻譯整理資料時發生錯誤，請確認 API 連線正常"),
    });
  }
});

// API: 影音與 AI 即時深度對談
app.post("/api/chat", async (req, res) => {
  try {
    const { transcript, chatHistory, userMessage } = req.body;

    if (!userMessage || userMessage.trim() === "") {
      return res.status(400).json({ error: "訊息內容不能為空" });
    }

    // 格式化歷史紀錄
    const formattedContents: any[] = [];

    // 先加入上下文 context
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

    // 以前歷史訊息
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach((msg: any) => {
        formattedContents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      });
    }

    // 本次使用者新增訊息
    formattedContents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: "你是一個附屬於影片摘要工具的 AI 專屬互動解答助理，專長是以繁體中文就一部影片的細節進行極深度解答、觀點拓展與實踐方法擴充。",
        temperature: 0.7,
      },
    }));

    const answer = response.text || "助理目前似乎無法回答，請稍候再試。";
    return res.json({ answer });

  } catch (error: any) {
    console.error("chat error:", error);
    return res.status(500).json({
      error: formatGeminiError(error, "智能問答處理出錯，請稍候重試"),
    });
  }
});

// Vite middleware 整合
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
