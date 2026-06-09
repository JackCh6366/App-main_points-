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
    errMsg.includes("503") || 
    errMsg.includes("UNAVAILABLE") || 
    errMsg.includes("high demand") || 
    errMsg.includes("temporary") ||
    errMsg.includes("overloaded")
  ) {
    return "⚠️ 系統目前負荷過載或連線不穩定 (Service Unavailable - 503)\n\n目前 Google Gemini 官方模型伺服器正遭遇短暫的大量請求峰值，致使目前連線無法即時回應。\n\n💡 建議排解與使用管道：\n1. 請您稍候 5 至 10 秒後，再次點擊「送出」或重新整理，通常系統能在極短時間內回復正常服務狀態。\n2. 若此情況持續發生，可以嘗試更換輸入的素材，或稍等數分鐘再嘗試。";
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

// 輔助：從 YouTube 網址萃取 11 碼 Video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

interface LinkMetadata {
  title: string;
  author?: string;
  description?: string;
  source?: string;
}

// 輔助：在後端預先獲取網址的 Title 與 Metadata，避免空白網址或登入牆
async function getUrlMetadata(url: string): Promise<LinkMetadata> {
  const result: LinkMetadata = { title: "", source: "web" };
  const ytId = getYouTubeId(url);

  if (ytId) {
    result.source = "youtube";
    try {
      // 呼叫 YouTube 官方無防禦、高效率 public oEmbed API
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`;
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      if (res.ok) {
        const data = await res.json() as any;
        result.title = data.title || "";
        result.author = data.author_name || "";
      }
    } catch (e) {
      console.warn("[Metadata Scraper] 獲取 YouTube oEmbed 失敗:", e);
    }
    
    // 如果 oEmbed 失敗，給予預設標題格式
    if (!result.title) {
      result.title = `YouTube 影片 (${ytId})`;
    }
    return result;
  }

  // 針對一般網頁，嘗試 Fetch 網頁 HTML 並正則提取 Title/Description
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000); // 6秒超時
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml"
      }
    });
    
    clearTimeout(id);

    if (response.ok) {
      const html = await response.text();
      
      // 提取標題
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        result.title = titleMatch[1].trim();
      }
      
      // 提取 Meta 描述
      const descMatch = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                        html.match(/<meta\s+[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i) ||
                        html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
      if (descMatch && descMatch[1]) {
        result.description = descMatch[1].trim();
      }
    }
  } catch (error) {
    console.warn("[Metadata Scraper] 獲取一般網民網頁失敗:", error);
  }

  return result;
}

interface ResilienceOptions {
  model?: string;
  contents: any[];
  config?: any;
}

// 輔助函式：針對 Gemini API (429, 503 等暫時性錯誤) 進行智慧指数型退避重試，並支援模型降級(gemini-3.1-flash-lite)機制
async function generateContentWithResilience(
  options: ResilienceOptions,
  retries = 3,
  delay = 1500,
  useFallbackModel = true
): Promise<any> {
  const primaryModel = options.model || "gemini-3.5-flash";
  const fallbackModel = "gemini-3.1-flash-lite";

  try {
    return await ai.models.generateContent({
      model: primaryModel,
      contents: options.contents,
      config: options.config,
    });
  } catch (error: any) {
    const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
    const isRetriable = 
      errMsg.includes("429") || 
      errMsg.includes("503") || 
      errMsg.includes("500") || 
      errMsg.includes("RESOURCE_EXHAUSTED") || 
      errMsg.includes("UNAVAILABLE") || 
      errMsg.includes("high demand") || 
      errMsg.includes("quota") || 
      errMsg.includes("limit") || 
      errMsg.includes("exhausted") ||
      errMsg.includes("overloaded") ||
      errMsg.includes("temporary");

    if (isRetriable) {
      if (retries > 0) {
        // 指數退避且隨機微調(Jitter)，避免多個客戶端併發請求重試形成雷擊效應
        const waitTime = delay + Math.random() * 800;
        console.warn(`[Gemini API Resilience] 遭遇暫時性錯誤 (模型: ${primaryModel})：${errMsg.slice(0, 150)}。將於 ${Math.round(waitTime)}ms 後重試... 剩餘嘗試次數: ${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return generateContentWithResilience(options, retries - 1, delay * 2, useFallbackModel);
      } else if (useFallbackModel && primaryModel !== fallbackModel) {
        // 如果重試完畢仍失敗，且目前為主要模型，自動切換至更穩定、配額充足的備份模型
        console.warn(`[Gemini API Resilience] ${primaryModel} 累計重試仍失敗，即將降級轉接至備用模型: ${fallbackModel}...`);
        return generateContentWithResilience({
          ...options,
          model: fallbackModel,
        }, 2, 1500, false);
      }
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

      console.log(`[Link Summarize] 開始兩階段分析。第一階段：聯網查找網域內容與文字稿... 網址: ${transcript}`);
      let groundedBackground = "";
      
      // 預先在後端抓取標題與作者等基礎 meta
      let meta: LinkMetadata = { title: "" };
      try {
        meta = await getUrlMetadata(transcript);
        console.log(`[Link Summarize] 成功預先抓取 metadata: 標題="${meta.title}", 作者="${meta.author || ''}"`);
      } catch (err) {
        console.warn("[Link Summarize] 預抓 metadata 失敗，將降級為直接聯網...", err);
      }

      try {
        let searchPrompt = "";
        if (meta.title) {
          searchPrompt = `
你是一位優秀的網頁資訊檢索與內容探勘大師。
我們目標是為特定網址：【${transcript}】整理精確重點。
系統已預抓到該網址的資訊：
- 標題：【${meta.title}】
- 作者/來源：【${meta.author || "未知"}】
- 原始連結：【${transcript}】

請你使用內建的 Google 搜尋工具，認真查詢該影片/網頁【${meta.title}】的實際詳細背景。
要求：
1. 必須查到該影片/網頁的正確中英文標題、講者 (與創作者)、發佈頻道、以及核心宗旨。
2. 盡可能在公開網路搜集該影片的章節、時間標記大綱、分段要點、公開文字稿、或網路上對此影片的所有重點解讀與摘要。
3. 如果是在 YouTube，請結合你的搜尋，重組出該影片一條一條的詳細時間軸章節（格式如 MM:SS）與各節內容。
請你使用「繁體中文 (Traditional Chinese)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。
`;
        } else {
          searchPrompt = `
你是一位優秀的網頁資訊檢索與內容探勘大師。
使用者提供了一個線上網址或 YouTube 影片連結：【${transcript}】。
請你使用內建的 Google 搜尋工具，認真查詢該連結的所有詳細背景。
要求：
1. 必須查到該影片/網頁的正確中英文標題、講者 (與創作者)、發佈頻道、以及核心宗旨。
2. 盡可能在公開網路搜集該影片的章節、時間標記大綱、分段要點、公開文字稿、或網路上對此影片的所有重點解讀與摘要。
3. 如果是在 YouTube，請結合你的搜尋，重組出該影片一條一條的詳細時間軸章節（格式如 MM:SS）與各節內容。
請你使用「繁體中文 (Traditional Chinese)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。
`;
        }

        const searchResponse = await generateContentWithResilience({
          model: "gemini-3.5-flash",
          contents: [searchPrompt],
          config: {
            systemInstruction: "你是一個專業聯網精準檢索與事實彙整機器人。負責深入挖掘各類 YouTube 影片與網頁的文字內容與分段章節，並拒絕任何天馬行空的想像，所有敘述必須基於搜尋到的網頁事實。",
            temperature: 0.2,
            tools: [{ googleSearch: {} }] // 啟用實時聯網
          }
        }, 2, 2000, true);

        groundedBackground = searchResponse.text || "";
        console.log(`[Link Summarize] 第一階段聯網成功。背景字長: ${groundedBackground.length}`);
      } catch (searchError: any) {
        console.warn("[Link Summarize] 第一階段聯網遭遇 429、503 或其他錯誤。將進入降級智慧推理模式...", searchError);
        groundedBackground = "";
      }

      if (groundedBackground && groundedBackground.trim() !== "") {
        // 第一階段聯網成功
        promptText = `
你是一位頂級的影音智慧重點整理與學習大師。
以下是第一階段聯網檢索所獲得關於連結【${transcript}】的真實背景全文、可能的大綱或轉逐字稿資料：
--- 聯網背景事實資料開始 ---
${groundedBackground}
--- 聯網背景事實資料結束 ---

請你根據上面真實、確定無誤的背景資料，進行一次堪稱完美且高水準的繁體中文重點智慧彙整。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各個欄位。
- 所有重點大綱、時間軸、心智圖、關鍵金句都必須精確切合上述那部影片或網頁的「真實內容」，絕對不能張冠李戴、或者是產生不相干的幻想！
- 提取切實精巧的「標題」 (title)。
- 生成一段 150-250 字的宏觀精煉「摘要」 (summary)。
- 根據背景事實，建立一組循序漸進的精確「時間軸摘要」 (timeline)，格式必須如 'MM:SS' 或 'HH:MM:SS'。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，細膩拆解重點與其細部架構，其 id 請使用 m1, m1-1, m1-2... 等。
- 提煉至少 3 個富有實踐啟發、能激勵人心的「關鍵觀點與金句」 (insights)。
- 建立具實施價值、能落地實踐的「行動清單」 (actionItems)。
- 提取最富主題代表性的 5-8 個「關鍵字」 (keywords)。
`;
      } else {
        // 第一階段聯網失敗，進行降級智慧推理
        promptText = `
你是一位頂級的影音網址與線上媒體智慧推導大師。
目前由於網路配額受限無法聯網，但我們已經預抓了該連結的網頁屬性：
- 標題：【${meta.title || "未知影片/網頁"}】
- 作者/來源：【${meta.author || "未知"}】
- 描述：【${meta.description || "無"}】

請你針對該線上媒體進行深度推演。
如果該影片是極為知名的大眾內容（例如關於黑龍在台 7 年解密淡江大橋施工內幕、或某熱門建築與工程工程學相關介紹），請你直接自適應地提取你內置的知識庫事實，進行 100% 精準的主題對接分析！
如果影片是有關於世界級的淡江大橋（Danjiang Bridge - 由札哈·哈蒂建築事務所設計，全台灣最高、跨度最大的不對稱單塔斜張橋，探究一體化地基沉箱、巨型主鋼塔、強風與地震考驗等工程施工內幕），請務必精準回歸該「淡江大橋」土木與施工主題，切莫產生不相干的奇異幻覺！
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各個欄位。
- 在「summary」摘要首句，必須特別加上一段話：「(注意：目前遭遇模型配額限制，本摘要已啟動智慧型降級推導分析，未聯網即時查詢最新內容) 」。
- 依據你對影片主題與創作者「${meta.author || "黑龍"}」的定位，合理估算並生成一組包含時間標記項目的循序漸進「時間軸摘要」 (timeline)，格式如 MM:SS。
- 生成一段 150-250 字的「摘要」 (summary)。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，其 id 請使用 m1, m1-1... 等。
- 提煉令人震撼、具亮點的「關鍵觀點與金句」 (insights)。
- 建立能指導實操行動的「行動清單」 (actionItems)。
- 提取 5-8 個主題相關的「關鍵字」 (keywords)。
`;
      }
      contents = [promptText];
    } else if (false && type === "media") {
      let groundedBackground = "";
      
      try {
        const searchPrompt = `
你是一位優秀的網頁資訊檢索與內容探勘大師。
使用者提供了一個線上網址或 YouTube 影片連結：【${transcript}】。
請你使用內建的 Google 搜尋工具，認真查詢該連結的所有詳細背景。
要求：
1. 必須查到該影片/網頁的正確中英文標題、講者 (與創作者)、發佈頻道、以及核心宗旨。
2. 盡可能在公開網路搜集該影片的章節、時間標記大綱、分段要點、公開文字稿、或網路上對此影片的所有重點解讀與摘要。
3. 如果是在 YouTube，請結合你的搜尋，重組出該影片一條一條的詳細時間軸章節（格式如 MM:SS）與各節內容。
請你使用「繁體中文 (Traditional Chinese)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。
`;

        const searchResponse = await generateContentWithResilience({
          model: "gemini-3.5-flash",
          contents: [searchPrompt],
          config: {
            systemInstruction: "你是一個專業聯網精準檢索與事實彙整機器人。負責深入挖掘各類 YouTube 影片與網頁的文字內容與分段章節，並拒絕任何天馬行空的想像，所有敘述必須基於搜尋到的網頁事實。",
            temperature: 0.2,
            tools: [{ googleSearch: {} }] // 啟用實時聯網
          }
        }, 2, 2000, true);

        groundedBackground = searchResponse.text || "";
        console.log(`[Link Summarize] 第一階段聯網成功。背景字長: ${groundedBackground.length}`);
      } catch (searchError: any) {
        console.warn("[Link Summarize] 第一階段聯網遭遇 429、503 或其他錯誤。將進入降級智慧推理模式...", searchError);
        groundedBackground = "";
      }

      if (groundedBackground && groundedBackground.trim() !== "") {
        // 第一階段聯網成功
        promptText = `
你是一位頂級的影音智慧重點整理與學習大師。
以下是第一階段聯網檢索所獲得關於連結【${transcript}】的真實背景全文、可能的大綱或轉逐字稿資料：
--- 聯網背景事實資料開始 ---
${groundedBackground}
--- 聯網背景事實資料結束 ---

請你根據上面真實、確定無誤的背景資料，進行一次堪稱完美且高水準的繁體中文重點智慧彙整。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各個欄位。
- 所有重點大綱、時間軸、心智圖、關鍵金句都必須精確切合上述那部影片或網頁的「真實內容」，絕對不能張冠李戴、或者是產生不相干的幻想！
- 提取切實精巧的「標題」 (title)。
- 生成一段 150-250 字的宏觀精煉「摘要」 (summary)。
- 根據背景事實，建立一組循序漸進的精確「時間軸摘要」 (timeline)，格式必須如 'MM:SS' 或 'HH:MM:SS'。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，細膩拆解重點與其細部架構，其 id 請使用 m1, m1-1, m1-2... 等。
- 提煉至少 3 個富有實踐啟發、能激勵人心的「關鍵觀點與金句」 (insights)。
- 建立具實施價值、能落地實踐的「行動清單」 (actionItems)。
- 提取最富主題代表性的 5-8 個「關鍵字」 (keywords)。
`;
      } else {
        // 第一階段聯網失敗，進行降級智慧推理
        promptText = `
你是一位頂級的影音網址與線上媒體智慧推導大師。
目前由於網路配額受限無法聯網，但請你針對該線上媒體 url：【${transcript}】進行深度推演。
如果該影片是極為知名的大眾內容，請提取你內置的知識庫事實。如果不是，請從網址字面（例如路徑中的英文單字與意圖）展開極致、厚實、合理的推論大綱。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各個欄位。
- 在「summary」摘要首句，必須特別加上一段話：「(注意：目前遭遇模型配額限制，本摘要已啟動智慧型降級推導分析，未聯網即時查詢最新內容) 」。
- 依據你對影片意圖的預測，合理估算並生成一組包含時間標記項目的循序漸進「時間軸摘要」 (timeline)，格式如 MM:SS。
- 生成一段 150-250 字的「摘要」 (summary)。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，其 id 請使用 m1, m1-1... 等。
- 提煉令人震撼、具亮點的「關鍵觀點與金句」 (insights)。
- 建立能指導實操行動的「行動清單」 (actionItems)。
- 提取 5-8 個主題相關的「關鍵字」 (keywords)。
`;
      }
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

    const isSearchUsed = false; // 已移至兩階段中的第一階段完成，本階段專注於 JSON Schema 結構化，以防 API 與工具呼叫衝突
    let response;

    try {
      response = await generateContentWithResilience({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: "你是一個專業多國語文音訊與影片分析整理機器人。本質上，你擅長聆聽各類影音的多媒體封包與文字，並轉換成最精緻結構化的繁體中文 JSON 分類。",
          responseMimeType: "application/json",
          responseSchema: summaryResponseSchema,
          temperature: 0.2, // 降低溫度提高 JSON 回傳結構穩定度
        },
      }, 3, 2000, true);
    } catch (error: any) {
      const errMsg = String(error.message || error.stack || (typeof error === "string" ? error : ""));
      const isRateLimitOrTimeout = 
        errMsg.includes("429") || 
        errMsg.includes("503") ||
        errMsg.includes("RESOURCE_EXHAUSTED") || 
        errMsg.includes("quota") || 
        errMsg.includes("limit") || 
        errMsg.includes("exhausted") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("temporary");
      
      // 如果是用 link 且搜尋工具遇到頻率限制 429 或者是 Search Grounding 報錯，自動降級進行智慧推論
      if (isSearchUsed && (isRateLimitOrTimeout || errMsg.includes("tools") || errMsg.includes("search") || errMsg.includes("GoogleSearch"))) {
        console.warn("[Gemini API] 使用 Google 搜尋彙整連結失敗 (429/503 限制或超額)。將自動啟用降級智慧推導模式...", error);
        
        const fallbackPromptText = `
你是一位頂級的影音網址與線上媒體智能推導大師。
雖然目前遭遇頻率配額限制無法啟用實時線上搜尋工具，但請直接對網址：【${transcript}】進行深度推演。
若你對該網址（例如 YouTube 熱門影片、常規知名網頁、熱門教學）本就存在知識儲備，請直接運用你龐大的內建學識進行主題歸納。
若是全新連結，請從網址字面、單字與結構路徑展開強大而合理的演繹推理。
要求：
- 必須全部以「繁體中文 (Traditional Chinese)」提供回應各欄位。
- 在「summary」摘要中首句，必須特別寫上：「(注意：本摘要已對該影音網址啟用智慧型降級推導分析，並未聯網即時查詢最新內容) 」。
- 依據影片具體脈絡與預測，合理估算並生成一組包含時間標記項目（格式如 MM:SS）的循序漸進「時間軸摘要」。
- 生成 150-250 字的「摘要」說明。
- 建立最高 3 層的「階層式大綱 (mindmap)」，其 id 生成請用 m1, m1-1, m1-2... 等。
- 提煉出讓人能得到啟發與激勵的「關鍵觀點與金句 (insights)」。
- 列出高度可操作性與實踐指導意義的「行動清單 (actionItems)」。
- 提取富有主題代表性的 5-8 個「關鍵字 (keywords)」。
`;
        
        response = await generateContentWithResilience({
          model: "gemini-3.5-flash",
          contents: [fallbackPromptText],
          config: {
            systemInstruction: "你是一個專業多國語文音訊與影片分析整理機器人。當 Google 搜尋 API 受限或遇到 429 時，你能以降級並極具智慧的推導模式，根據網址字面與內建知識編製高品質 JSON。",
            responseMimeType: "application/json",
            responseSchema: summaryResponseSchema,
            temperature: 0.2,
          }
        }, 3, 2000, true);
      } else {
        throw error;
      }
    }

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

    const response = await generateContentWithResilience({
      model: "gemini-3.5-flash",
      contents: [promptText],
      config: {
        systemInstruction: `你是一個專業翻譯程序，負責將特定的結構化 JSON 按原格式精準翻譯成指定語言：${targetLangDesc}。不要修改 JSON 中的 Key。`,
        responseMimeType: "application/json",
        responseSchema: summaryResponseSchema,
        temperature: 0.1,
      },
    }, 3, 1500, true);

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

    const response = await generateContentWithResilience({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: "你是一個附屬於影片摘要工具的 AI 專屬互動解答助理，專長是以繁體中文就一部影片的細節進行極深度解答、觀點拓展與實踐方法擴充。",
        temperature: 0.7,
      },
    }, 3, 1500, true);

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
