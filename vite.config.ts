import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
dotenv.config({ quiet: true });

// ─── 讀取 request body（含 timeout 保護與 already-consumed 偵測）─────────────
function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if ((req as any).body !== undefined) {
      const b = (req as any).body;
      return resolve(typeof b === 'string' ? tryParse(b) : b);
    }

    if (req.readableEnded || !req.readable) {
      return resolve({});
    }

    let raw = '';
    const onData  = (chunk: Buffer) => { raw += chunk.toString(); };
    const onEnd   = () => { cleanup(); resolve(tryParse(raw)); };
    const onError = () => { cleanup(); resolve(tryParse(raw)); };
    const timer   = setTimeout(() => { cleanup(); resolve(tryParse(raw)); }, 2000);

    function cleanup() {
      clearTimeout(timer);
      req.off('data',  onData);
      req.off('end',   onEnd);
      req.off('error', onError);
    }

    req.on('data',  onData);
    req.on('end',   onEnd);
    req.on('error', onError);
  });
}

function tryParse(s: string): any {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

// ─── 送 JSON 回應 ─────────────────────────────────────────────────────────────
function sendJson(res: ServerResponse, status: number, data: any) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── 智慧重試 fetch ────────────────────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delayMs = 1500
): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err: any) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delayMs + Math.random() * 500));
      return fetchWithRetry(url, options, retries - 1, delayMs * 1.5);
    }
    throw err;
  }
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

// 輔助：預先獲取網址的 Title 與 Metadata
async function getUrlMetadata(url: string): Promise<LinkMetadata> {
  const result: LinkMetadata = { title: "", source: "web" };
  const ytId = getYouTubeId(url);

  if (ytId) {
    result.source = "youtube";
    try {
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

    if (!result.title) {
      result.title = `YouTube 影片 (${ytId})`;
    }
    return result;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);

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
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        result.title = titleMatch[1].trim();
      }

      const descMatch = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                        html.match(/<meta\s+[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i) ||
                        html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
      if (descMatch && descMatch[1]) {
        result.description = descMatch[1].trim();
      }
    }
  } catch (error) {
    console.warn("[Metadata Scraper] 獲取網頁失敗:", error);
  }

  return result;
}

// 輔助：修復與清洗 JSON 字串（處理 trailing commas、未轉義控制字元、單引號等）
function cleanAndRepairJson(badJson: string): string {
  let result = "";
  let inString = false;
  let stringChar = "";
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < badJson.length; i++) {
    const char = badJson[i];

    if (escaped) {
      if (char === "'") {
        if (result.endsWith("\\")) {
          result = result.slice(0, -1);
        }
        result += "'";
      } else {
        result += char;
      }
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      if (inString) {
        escaped = true;
      }
      continue;
    }

    if (inString) {
      if (char === stringChar) {
        inString = false;
        result += '"';
      } else if (char === '"' && stringChar === "'") {
        result += '\\"';
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else {
        result += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      result += '"';
      continue;
    }

    // 過濾註解
    if (char === "/" && badJson[i + 1] === "/") {
      while (i < badJson.length && badJson[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (char === "/" && badJson[i + 1] === "*") {
      i += 2;
      while (i < badJson.length && !(badJson[i] === "*" && badJson[i + 1] === "/")) {
        i++;
      }
      i++;
      continue;
    }

    // 紀錄括號匹配以補齊截斷的 JSON
    if (char === "{") {
      stack.push("}");
    } else if (char === "[") {
      stack.push("]");
    } else if (char === "}") {
      if (stack[stack.length - 1] === "}") {
        stack.pop();
      }
    } else if (char === "]") {
      if (stack[stack.length - 1] === "]") {
        stack.pop();
      }
    }

    // 移除尾隨逗號 (Trailing Commas)
    if (char === ",") {
      let lookAheadIdx = i + 1;
      let nextChar = "";
      while (lookAheadIdx < badJson.length) {
        const next = badJson[lookAheadIdx];
        if (next === "/" && badJson[lookAheadIdx + 1] === "/") {
          while (lookAheadIdx < badJson.length && badJson[lookAheadIdx] !== "\n") {
            lookAheadIdx++;
          }
          continue;
        }
        if (next === "/" && badJson[lookAheadIdx + 1] === "*") {
          lookAheadIdx += 2;
          while (lookAheadIdx < badJson.length && !(badJson[lookAheadIdx] === "*" && badJson[lookAheadIdx + 1] === "/")) {
            lookAheadIdx++;
          }
          lookAheadIdx += 1;
          continue;
        }
        if (!/\s/.test(next)) {
          nextChar = next;
          break;
        }
        lookAheadIdx++;
      }
      if (nextChar === "}" || nextChar === "]") {
        continue; // 略過此逗號
      }
    }

    result += char;
  }

  if (inString) {
    result += '"';
  }

  while (stack.length > 0) {
    const closing = stack.pop();
    result += closing;
  }

  return result;
}

// 輔助：強健的 JSON 解析器
function parseJSONResponse(text: string): any {
  let cleaned = text.trim();

  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');

  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error("模型回傳的內容無法解析為有效的 JSON 結構:\n" + (text.length > 200 ? text.slice(0, 200) + "..." : text));
  }

  const jsonStr = cleaned.slice(startIdx, endIdx + 1);
  const repaired = cleanAndRepairJson(jsonStr);
  return JSON.parse(repaired);
}

// ─── JSON schema（summarize / translate 共用）────────────────────────────────
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: "基於本影音或內容，自動生成的主題或最切合的標題。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
    },
    summary: {
      type: 'string',
      description: "500-800字以上極其詳盡、結構清晰且分段的繁體中文深度概要。要能透徹分析內容宗旨、背景脈絡、核心論點與結論，請使用豐富描述性長句，絕對不可簡略或只給出一小段。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
    },
    timeline: {
      type: 'array',
      description: "本內容或影音循序漸進的完整詳細時間軸摘要。請詳細覆蓋整個影音的所有核心段落（至少 8-15 個時間點，若內容極短則依實際長度）。如果有明確秒數，請務必精準標記(例如 00:15)，若無可概略估算(例如 00:00, 01:30等) (必填)",
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: "時間標記, 格式必須如 MM:SS 或 HH:MM:SS" },
          title: { type: 'string', description: "此項目的精炼大綱主題。必須是繁體中文 (台灣習慣之繁體中文)" },
          description: { type: 'string', description: "該段落主要談論細節、要點概要。必須是繁體中文 (台灣習慣之繁體中文)，且敘述應儘可能詳實完整，以 2-4 句詳細記錄該時段的關鍵對話、細節與重要論點，不要簡化" }
        },
        required: ['time', 'title', 'description']
      }
    },
    mindmap: {
      type: 'array',
      description: "基於本內容的階層式樹狀重點大綱，最多支持3層巢狀結構。一級核心主題必須在 5-8 個之間。請確保所有節點的 label 都使用具體、描述性的詞句 (約 10-25 字，包含行動或實質內容，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以確保心智圖資訊量豐富，絕對不可敷衍簡略。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "唯一識別碼 e.g. 'm1'" },
          label: { type: 'string', description: "一級核心主題名稱 (10-25字)。必須是繁體中文 (台灣習慣之繁體中文)" },
          children: {
            type: 'array',
            description: "二級核心重點。每個一級主題下應包含至少 2-4 個二級節點",
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: "唯一識別碼 e.g. 'm1-1'" },
                label: { type: 'string', description: "二級核心重點名稱 (10-25字)。必須是繁體中文 (台灣習慣之繁體中文)" },
                children: {
                  type: 'array',
                  description: "三級關鍵細節。每個二級重點下應包含至少 2-4 個三級節點，詳細記錄具體細節",
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: "唯一識別碼 e.g. 'm1-1-1'" },
                      label: { type: 'string', description: "三級關鍵細節描述 (15-30字)，請儘可能完整詳細描述具體細節，不要簡略。必須是繁體中文 (台灣習慣之繁體中文)" }
                    },
                    required: ['id', 'label']
                  }
                }
              },
              required: ['id', 'label']
            }
          }
        },
        required: ['id', 'label']
      }
    },
    insights: {
      type: 'array',
      description: "影音或內容中的關鍵觀點與金句 quote，請提煉 4-6 個極具啟發與激勵性的項目，以利深度閱讀。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: 'object',
        properties: {
          point: { type: 'string', description: "核心論點或啟發，請使用詳細的繁體中文 (台灣習慣之繁體中文) 說明" },
          quote: { type: 'string', description: "對應的精闢金句或原話重現/總結，必須是繁體中文 (台灣習慣之繁體中文)" }
        },
        required: ['point', 'quote']
      }
    },
    actionItems: {
      type: 'array',
      description: "本影音提出的下一步行動、可實踐的目標指引 e.g. 會議行動、學習任務等，請列出 4-6 個具體項目。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: 'object',
        properties: {
          task: { type: 'string', description: "具體的行動任務，必須是繁體中文 (台灣習慣之繁體中文)" },
          reason: { type: 'string', description: "做此任務的原因、關鍵價值與建議落實方式，敘述應詳盡充實，必須是繁體中文 (台灣習慣之繁體中文)" }
        },
        required: ['task', 'reason']
      }
    },
    keywords: {
      type: 'array',
      description: "本內容的主題關鍵字列表，5-8個，必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: 'string'
      }
    }
  },
  required: ['title', 'summary', 'timeline', 'mindmap', 'insights', 'actionItems', 'keywords']
};

const GEMINI_URL = (key: string, model = 'gemini-2.5-pro') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const GEMINI_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' };

const SYSTEM_INSTRUCTION = `你是一個專業多國語文音訊與影片分析整理機器人。你必須以繁體中文 (台灣習慣用語) 進行所有回覆，確保轉換為最精緻且內容極其詳盡結構化的繁體中文 JSON，嚴禁簡體字及中國大陸用語，如「信息」、「菜單」、「鏈接」、「優化」、「視頻」、「音頻」、「屏幕」應轉換為「資訊」、「選單」、「連結」、「最佳化」、「影片」、「音訊」、「螢幕」等。`;

// ─── Gemini handler ───────────────────────────────────────────────────────────
async function handleGemini(body: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定，請檢查 .env.local');

  const { action, type, transcript, fileName, fileBase64, mimeType,
          summaryData, targetLanguage, chatHistory, userMessage } = body;

  // ── chat ──────────────────────────────────────────────────────────────────
  if (action === 'chat') {
    const formattedContents: any[] = [
      {
        role: 'user',
        parts: [{ text: `你是本影片的智能 AI 問答助手。影音內容背景：\n${transcript || '無'}\n\n請基於這部影音所談論的事實、亮點與觀點，有深度、熱情、客觀地回答使用者的提問。若影音中沒有直接談及，也可以結合你的知識庫，但要特別說明「影片中並非主要提及，但補充如下...」。一律使用「繁體中文 (台灣習慣用語)」回答，嚴禁簡體字與大陸用語。` }]
      }
    ];
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach((m: any) => formattedContents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
    }
    formattedContents.push({ role: 'user', parts: [{ text: userMessage }] });

    const r = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-flash'), {
      method: 'POST', headers: GEMINI_HEADERS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "你是一個附屬於影片摘要工具的 AI 專屬互動解答助理，專長是以繁體中文 (台灣習慣用語) 就一部影片的細節進行極深度解答、觀點拓展與實踐方法擴充，嚴禁使用簡體字與大陸用語。" }] },
        contents: formattedContents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536, // ✅ 新增：Chat 回應最大輸出上限
        }
      })
    });
    const d: any = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    return { answer: d?.candidates?.[0]?.content?.parts?.[0]?.text || '助理暫時無法回答，請稍後再試。' };
  }

  // ── translate ─────────────────────────────────────────────────────────────
  if (action === 'translate') {
    const langMap: Record<string, string> = {
      en: '英文 (English)', ja: '日文 (Japanese)',
      ko: '韓文 (Korean)', 'zh-tw': '繁體中文 (Traditional Chinese)'
    };
    const targetLangDesc = langMap[targetLanguage] || '繁體中文 (Traditional Chinese)';
    const r = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-flash'), {
      method: 'POST', headers: GEMINI_HEADERS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `你是一個專業翻譯程序，負責將特定的結構化 JSON 按原格式精準翻譯成指定語言：${targetLangDesc}。你必須以該語言最適切、流暢的形式進行翻譯。若目標語言為繁體中文，必須使用台灣習慣用語，嚴禁簡體字。不要修改 JSON 中的 Key。` }] },
        contents: [{
          role: 'user',
          parts: [{ text: `請將以下 JSON 中所有重點整理的文字內容完美翻譯成【${targetLangDesc}】。\n${JSON.stringify(summaryData, null, 2)}` }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SUMMARY_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 65536, // ✅ 新增：翻譯輸出最大上限
        }
      })
    });
    const d: any = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return parseJSONResponse(txt);
  }

  // ── summarize ─────────────────────────────────────────────────────────────
  if (action === 'summarize') {
    // 影音連結：先用 Google Search 抓資料，再結構化
    if (type === 'link') {
      let groundedBackground = '';
      let meta: LinkMetadata = { title: "" };

      try {
        meta = await getUrlMetadata(transcript);
        console.log(`[Link Summarize Emulator] 成功預先抓取 metadata: 標題="${meta.title}", 作者="${meta.author || ''}"`);
      } catch (err) {
        console.warn("[Link Summarize Emulator] 預抓 metadata 失敗，將降級為直接聯網...", err);
      }

      try {
        let searchPrompt = "";
        if (meta.title) {
          searchPrompt = `你是一位優秀的網頁資訊檢索與內容探勘大師。
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
請你使用「繁體中文 (Traditional Chinese，台灣習慣用語)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。`;
        } else {
          // ⭐ 此處已修正字串開頭的語法邊界問題，確保純淨模板字串開始
          searchPrompt = `你是一位優秀的網頁資訊檢索與內容探勘大師。
使用者提供了一個線上網址或 YouTube 影片連結：【${transcript}】。
請你使用內建的 Google 搜尋工具，認真查詢該連結的所有詳細背景。
要求：
1. 必須查到該影片/網頁的正確中英文標題、講者 (與創作者)、發佈頻道、以及核心宗旨。
2. 盡可能在公開網路搜集該影片的章節、時間標記大綱、分段要點、公開文字稿，或網路上對此影片的所有重點解讀與摘要。
3. 如果是在 YouTube，請結合你的搜尋，重組出該影片一條一條的詳細時間軸章節（格式如 MM:SS）與各節內容。
請你使用「繁體中文 (Traditional Chinese，台灣習慣用語)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。`;
        }

        const searchRes = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-flash'), {
          method: 'POST', headers: GEMINI_HEADERS,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "你是一個專業聯網精準檢索與事實彙整機器人。負責深入挖掘各類 YouTube 影片與網頁的文字內容與分段章節，並拒絕任何天馬行空的想像，所有敘述必須基於搜尋到的網頁事實，且所有回答皆必須使用台灣習慣之繁體中文。" }] },
            contents: [{
              role: 'user',
              parts: [{ text: searchPrompt }]
            }],
            tools: [{ googleSearch: {} }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 65536,
            }
          })
        });
        const searchData: any = await searchRes.json();
        if (searchData.error) throw new Error(searchData.error.message);
        groundedBackground = searchData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (searchError: any) {
        console.warn("[Link Summarize Emulator] 第一階段聯網失敗，降級智慧推理...", searchError);
        groundedBackground = "";
      }

      let promptText = "";
      if (groundedBackground && groundedBackground.trim() !== "") {
        promptText = `你是一位頂級的影音智慧重點整理與學習大師。
以下是第一階段聯網檢索所獲得關於連結【${transcript}】的真實背景全文、可能的大綱或轉逐字稿資料：
--- 聯網背景事實資料開始 ---
${groundedBackground}
--- 聯網背景事實資料結束 ---

請你根據上面真實、確定無誤的背景資料，進行一次堪稱完美且高水準的繁體中文重點智慧彙整。
要求：
- 必須全部以「繁體中文 (Traditional Chinese，台灣習慣用語)」提供回應各個欄位，嚴禁簡體字。
- 所有重點大綱、時間軸、心智圖、關鍵金句都必須精確切合上述那部影片或網頁的「真實內容」，絕對不能張冠黎戴、或者是產生不相干的幻想！
- 為了最大化產出完整與高含金量的分析，請利用模型最大承載與輸出能力，為各欄位生成極其詳盡、深度的分析，絕對不可敷衍簡略。
- 提取切實精巧的「標題」 (title)。
- 整理出一個 500-800 字以上、結構清晰且分段的「概要摘要」(summary)，必須透徹分析內容主旨、背景與核心意圖，富含細節，避免高維度的籠統總結。
- 根據背景事實，建立一組循序漸進的完整詳細「時間軸摘要」 (timeline)，請詳細覆蓋整個內容（至少 8-15 個時間點，若內容極短則依實際長度），格式必須如 'MM:SS' 或 'HH:MM:SS'，並詳細描述（每個時間點 2-4 句繁體中文詳細記錄該時段的關鍵細節與論點，不要簡化）。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，一級主題必須在 5-8 個之間，且每個一級主題下必須至少有 2-4 個二級重點，每個二級重點下至少有 2-4 個三級關鍵細節。所有節點的 label 必須使用具體描述性的詞句 (約 10-25 字，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以確保心智圖資訊量豐富，以利前台渲染樹狀圖。其 id 請使用 m1, m1-1, m1-2... 等。
- 提煉至少 4-6 個富有實踐啟發、能激勵人心的「關鍵觀點與金句」 (insights)，且觀點 point 描述與 quote 金句內容應充實詳細。
- 建立至少 4-6 個具實施價值、能落地實踐的「行動清單」 (actionItems)，提供詳細的實作步驟任務 task 與執行原因 reason。
- 提取最富主題代表性的 5-8 個「關鍵字」 (keywords)。`;
      } else {
        promptText = `你是一位頂級的影音網址與線上媒體智慧推導大師。
目前聯網查詢未能取得完整文字稿，但系統已預先抓取了該連結的網頁元資料：
- 標題：【${meta.title || "未知影片/網頁"}】
- 作者/來源：【${meta.author || "未知"}】
- 描述：【${meta.description || "無"}】
- 原始網址：【${transcript}】

請你根據以上元資料，搭配你的知識庫，針對此影片或網頁進行深度智慧推演與整理。
要求：
- 必須全部以「繁體中文 (Traditional Chinese，台灣習慣用語)」提供回應各個欄位，嚴禁簡體字。
- 為了最大化產出完整與高含金量的分析，請利用模型最大承載與輸出能力，為各欄位生成極其詳盡、深度的分析，絕對不可敷衍簡略。
- 在「summary」摘要首句，必須加上說明：「（注意：本摘要由連結元資料搭配知識庫推演生成，建議改用 Google Gemini 模式以獲得聯網即時搜尋的精準結果。）」且總字數需達 500-800 字以上，結構清晰且分段，敘述詳盡。
- 合理估算並生成一組循序漸進的完整詳細「時間軸摘要」(timeline)，請包含 8-15 個時間點，格式如 MM:SS 或 HH:MM:SS，且每個時間點需以 2-4 句繁體中文詳細記錄該時段的關鍵細節，不要簡化。
- 建立最高 3 層的樹狀階層式大綱「心智圖」(mindmap)，一級主題必須在 5-8 個之間，且每個一級主題下必須至少有 2-4 個二級重點，每個二級重點下至少有 2-4 個三級關鍵細節。所有節點的 label 必須使用具體描述性的詞句 (約 10-25 字，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以確保心智圖資訊量豐富，其 id 請使用 m1, m1-1... 等。
- 提煉至少 4-6 個富有啟發的「關鍵觀點與金句」(insights)，且內容描述應充實詳細。
- 建立至少 4-6 個具落地可行性的「行動清單」(actionItems)。
- 提取最富主題代表性的 5-8 個「關鍵字」(keywords)。`;
      }

      const structRes = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-pro'), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [{ text: promptText }]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SUMMARY_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 65536,
          }
        })
      });
      const structData: any = await structRes.json();
      if (structData.error) throw new Error(structData.error.message);
      const txt = structData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return parseJSONResponse(txt);
    }

    // 文字逐字稿
    if (type === 'transcript' || type === 'text') {
      const promptText = `你數位頂級的影音智慧重點整理與學習大師。
請針對以下影音的「逐字稿、字幕、或文字逐字記錄」內容，進行抽絲剝繭的深度思考與整理。
要求：
- 必須全部以「繁體中文 (Traditional Chinese，台灣習慣用語)」提供回應各個欄位，嚴禁簡體字。
- 為了最大化產出完整與高含金量的分析，請利用模型最大承載與輸出能力，為各欄位生成極其詳盡、深度的分析，絕對不可敷衍簡略。
- 提取切實精巧的「標題」 (title)。
- 整理出一個 500-800 字以上、結構清晰且分段的「概要摘要」(summary)，必須透徹分析內容主旨、背景與核心意圖，富含細節，避免高維度的籠統總結。
- 建立一組循序漸進的完整詳細「時間軸摘要」 (timeline)，請詳細覆蓋整個內容（至少 8-15 個時間點，若內容極短則依實際長度），格式必須如 'MM:SS' 或 'HH:MM:SS'，並詳細描述（每個時間點 2-4 句繁體中文詳細記錄該時段的關鍵細節與論點，不要簡化）。
- 建立最高 3 層的樹狀階層式大綱「心智圖 (mindmap)」，一級主題必須在 5-8 個之間，且每個一級主題下必須至少有 2-4 個二級重點，每個二級重點下至少有 2-4 個三級關鍵細節。所有節點的 label 必須使用具體描述性的詞句 (約 10-25 字，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以確保心智圖資訊量豐富，以利前台渲染樹狀圖. 其 id 請使用 m1, m1-1, m1-2... 等。
- 提煉至少 4-6 個富有實踐啟發、能激勵人心的「關鍵觀點與金句」 (insights)，且觀點 point 描述與 quote 金句內容應充實詳細。
- 建立至少 4-6 個具實施價值、能落地實踐的「行動清單」 (actionItems)，提供詳細的實作步驟任務 task 與執行原因 reason。
- 提取最富主題代表性的 5-8 個「關鍵字」 (keywords)。

--- 內容開始 ---
${transcript}
--- 內容結束 ---`;

      const r = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-pro'), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [{ text: promptText }]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SUMMARY_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 65536,
          }
        })
      });
      const d: any = await r.json();
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return parseJSONResponse(txt);
    }

    // 媒體檔案 / 錄音
    if (type === 'media' || type === 'file' || type === 'recording') {
      const promptText = `你數位頂級的語音、影片智能分析大師。
現在，使用者上傳了一個影音文件 (檔名：${fileName || "未命名影音"})。
請你仔細讀取並分析這份影音中的語音、字幕、影音畫面等多模態資料，進行頂級的繁體中文重點整理。
如果該影音非中文（如英文、日文、韓文等），請你先聽懂/理解內容，然後直接用「繁體中文 (Traditional Chinese，台灣習慣用語)」做完美的重點歸納，嚴禁簡體字。
要求：
- 為了最大化產出完整與高含金量的分析，請利用模型最大承載與輸出能力，為各欄位生成極其詳盡、深度的分析，絕對不可敷衍簡略。
- 自動生成最適切的「標題」。
- 整理出一個 500-800 字以上、結構清晰且分段的「概要摘要」(summary)，必須非常詳盡。
- 分析語音或影片畫面中各章節或說話亮點出現的實際「時間軸」，給出時間標記與詳細敘述（至少 8-15 個時間點，格式如 MM:SS 或 HH:MM:SS，每個時間點 2-4 句繁體中文詳細記錄，不要簡化）。
- 生成樹狀心智大綱 (mindmap), 一級主題必須在 5-8 個之間，且每個一級主題下必須至少有 2-4 個二級重點，每個二級重點下必須至少有 2-4 個三級關鍵細節。所有節點的 label 必須使用具體描述性的詞句 (約 10-25 字，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以 id (m1, m1-1, m1-1-1) 完美劃分 3 層階層。
- 提煉至少 4-6 個「關鍵啟發與金句」 (insights)，且內容描述應充實詳細。
- 建立至少 4-6 個具實操價值的「行動指標」 (actionItems)。
- 生成代表性的關鍵字 (keywords)。`;

      const r = await fetchWithRetry(GEMINI_URL(apiKey, 'gemini-2.5-pro'), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { data: fileBase64, mimeType } },
              { text: promptText }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SUMMARY_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 65536,
          }
        })
      });
      const d: any = await r.json();
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return parseJSONResponse(txt);
    }

    throw new Error('不支援的處理類型');
  }

  throw new Error(`不支援的 action: ${action}`);
}

// ─── NVIDIA handler ───────────────────────────────────────────────────────────
async function handleNvidia(body: any): Promise<any> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY 未設定，請檢查 .env.local');

  const { action, type, transcript, summaryData, targetLanguage, chatHistory, userMessage } = body;

  if ((type === 'media' || type === 'recording') && action === 'summarize') {
    throw new Error('NVIDIA 引擎為純文字模型，不支援音訊/影片上傳。請改用【貼上字稿】或【影音連結】模式。');
  }

  const NVIDIA_SYSTEM = `你是一個專業多國語文音訊與影片分析整理機器人。請直接回傳 JSON，不含任何說明文字或 Markdown 標記。
JSON 格式：{"title":"","summary":"","timeline":[{"time":"MM:SS","title":"","description":""}],"mindmap":[{"id":"m1","label":"","children":[{"id":"m1-1","label":"","children":[{"id":"m1-1-1","label":""}]}]}],"insights":[{"point":"","quote":""}],"actionItems":[{"task":"","reason":""}],"keywords":[""]}`;

  const callNvidia = async (messages: any[], jsonMode = false) => {
    const payload: any = {
      model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      messages,
      temperature: 0.2,
      max_tokens: 32768 // ✅ 從 4096 調整至 32768（NVIDIA Nemotron 49B 安全輸出上限）
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };

    const r = await fetchWithRetry('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    const rawText = await r.text();
    console.log('[NVIDIA Raw Response Status]:', r.status);
    console.log('[NVIDIA Raw Response Content]:', rawText);
    const d: any = JSON.parse(rawText);
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    return d?.choices?.[0]?.message?.content || '';
  };

  // ── chat ──
  if (action === 'chat') {
    const messages: any[] = [
      { role: 'system', content: '你是影片摘要工具的 AI 助理，用繁體中文回答關於影片內容的問題，一律使用台灣習慣用語，嚴禁簡體字。' },
      { role: 'user', content: `影音背景：${transcript || '無提供'}` }
    ];
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach((m: any) => messages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));
    }
    messages.push({ role: 'user', content: userMessage });
    const answer = await callNvidia(messages, false);
    return { answer: answer || '助理暫時無法回答' };
  }

  // ── translate ──
  if (action === 'translate') {
    const langMap: Record<string, string> = { en: '英文', ja: '日文', ko: '韓文', 'zh-tw': '繁體中文' };
    const raw = await callNvidia([
      { role: 'system', content: NVIDIA_SYSTEM },
      { role: 'user', content: `請將以下 JSON 翻譯成${langMap[targetLanguage] || '繁體中文'}，保持結構不變：\n${JSON.stringify(summaryData, null, 2)}` }
    ], true);
    return parseJSONResponse(raw);
  }

  // ── summarize ──
  if (action === 'summarize') {
    let userMsg = '';
    if (type === 'link') {
      let meta: LinkMetadata = { title: '' };
      try {
        meta = await getUrlMetadata(transcript);
        console.log(`[NVIDIA Link Local] 成功預抓 metadata: 標題="${meta.title}", 作者="${meta.author || ''}"`);
      } catch (err) {
        console.warn("[NVIDIA Link Local] 預抓 metadata 失敗，將使用原始 URL 推演...", err);
      }

      const ytId = getYouTubeId(transcript);
      const sourceNote = ytId
        ? `此為 YouTube 影片，Video ID: ${ytId}`
        : `此為一般網頁連結`;

      userMsg = `你是一位頂級的影音網址與線上媒體智慧推導大師。
使用者提供了以下連結：【${transcript}】
${sourceNote}

系統預先抓取到的網頁資訊如下：
- 標題：【${meta.title || "未知標題"}】
- 作者/來源：【${meta.author || "未知"}】
- 描述：【${meta.description || "無可用描述"}】

請你根據上述資訊，運用你的知識庫，對此影音或網頁內容進行深度智慧推演，並完全以繁體中文 (台灣習慣用語，嚴禁簡體字) 生成對應的結構化資訊。
摘要開頭請加「（注意：由連結元資料推演生成）」

--- 提供連結資訊 ---
原始網址：${transcript}
標題：${meta.title || "未知"}
來源作者：${meta.author || "未知"}
頁面描述：${meta.description || "無"}
--- 連結資訊結束 ---`;
    } else {
      userMsg = `請針對以下內容用繁體中文 (台灣習慣用語，嚴禁簡體字) 生成結構化 JSON：\n\n${transcript}`;
    }

    const raw = await callNvidia([
      { role: 'system', content: NVIDIA_SYSTEM },
      { role: 'user', content: userMsg }
    ], true);
    return parseJSONResponse(raw);
  }

  throw new Error(`不支援的 action: ${action}`);
}

// ─── Vite config ──────────────────────────────────────────────────────────────
export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "api-emulator",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';
            console.log(`[Vite Middleware] Incoming request: ${req.method} ${url}`);

            if (!url.startsWith('/api')) return next();

            console.log(`[API] ${req.method} ${url}`);

            try {
              const body = await readBody(req);
              console.log(`[API] body keys: ${Object.keys(body).join(', ')}`);

              const { provider, action } = body;

              if (!provider || !action) {
                return sendJson(res, 400, { error: 'Request body 缺少 provider 或 action，請確認前端送出格式正確' });
              }

              let result: any;
              if (provider === 'gemini') {
                result = await handleGemini(body);
              } else if (provider === 'nvidia') {
                result = await handleNvidia(body);
              } else {
                return sendJson(res, 400, { error: `不支援的 provider: ${provider}` });
              }

              sendJson(res, 200, result);

            } catch (err: any) {
              console.error('[API] 錯誤:', err.message);
              sendJson(res, 500, { error: err.message || '伺服器錯誤' });
            }
          });
        }
      }
    ],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
