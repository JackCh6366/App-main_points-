import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'http';
 
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
 
// ─── 讀取 request body（含 timeout 保護與 already-consumed 偵測）─────────────
function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    // 若 stream 已結束或不可讀，直接嘗試讀 (req as any).body（某些環境已預先解析）
    if ((req as any).body !== undefined) {
      const b = (req as any).body;
      return resolve(typeof b === 'string' ? tryParse(b) : b);
    }
 
    // readable 屬性在 stream 耗盡後為 false
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
 
// ─── JSON schema（summarize / translate 共用）────────────────────────────────
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title:   { type: 'string' },
    summary: { type: 'string' },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time:        { type: 'string' },
          title:       { type: 'string' },
          description: { type: 'string' }
        },
        required: ['time', 'title', 'description']
      }
    },
    mindmap: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          label: { type: 'string' },
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:    { type: 'string' },
                label: { type: 'string' },
                children: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, label: { type: 'string' } },
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
      items: {
        type: 'object',
        properties: { point: { type: 'string' }, quote: { type: 'string' } },
        required: ['point', 'quote']
      }
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: { type: 'string' }, reason: { type: 'string' } },
        required: ['task', 'reason']
      }
    },
    keywords: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'summary', 'timeline', 'mindmap', 'insights', 'actionItems', 'keywords']
};
 
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`;
 
const GEMINI_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' };
 
const SYSTEM_INSTRUCTION = `你是一個專業多國語文音訊與影片分析整理機器人。
擅長聆聽各類影音的多媒體封包與文字，轉換成最精緻結構化的繁體中文 JSON 分類。`;
 
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
        parts: [{ text: `你是本影片的 AI 問答助手。影音內容背景：\n${transcript || '無'}\n\n請基於內容有深度地回答，一律使用繁體中文。` }]
      }
    ];
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach((m: any) => formattedContents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
    }
    formattedContents.push({ role: 'user', parts: [{ text: userMessage }] });
 
    const r = await fetchWithRetry(GEMINI_URL(apiKey), {
      method: 'POST', headers: GEMINI_HEADERS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: formattedContents
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
    const r = await fetchWithRetry(GEMINI_URL(apiKey), {
      method: 'POST', headers: GEMINI_HEADERS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{
          role: 'user',
          parts: [{ text: `請將以下 JSON 中所有文字翻譯成【${langMap[targetLanguage] || '繁體中文'}】，保持 JSON 結構不變，id / time 不翻譯。\n${JSON.stringify(summaryData, null, 2)}` }]
        }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SUMMARY_SCHEMA, temperature: 0.1 }
      })
    });
    const d: any = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(txt.trim());
  }
 
  // ── summarize ─────────────────────────────────────────────────────────────
  if (action === 'summarize') {
    // 影音連結：先用 Google Search 抓資料，再結構化
    if (type === 'link') {
      const searchRes = await fetchWithRetry(GEMINI_URL(apiKey), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [{ text: `請搜尋此連結的詳細資訊（標題、作者、章節大綱、時間軸等）：【${transcript}】\n請用繁體中文輸出完整的背景資料。` }]
          }],
          tools: [{ googleSearch: {} }]
        })
      });
      const searchData: any = await searchRes.json();
      if (searchData.error) throw new Error(searchData.error.message);
      const background = searchData?.candidates?.[0]?.content?.parts?.[0]?.text || `連結：${transcript}`;
 
      const structRes = await fetchWithRetry(GEMINI_URL(apiKey), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [{ text: `根據以下背景資料，用繁體中文生成結構化 JSON 重點整理：\n\n${background}\n\n原始連結：${transcript}` }]
          }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SUMMARY_SCHEMA, temperature: 0.2 }
        })
      });
      const structData: any = await structRes.json();
      if (structData.error) throw new Error(structData.error.message);
      const txt = structData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(txt.trim());
    }
 
    // 文字逐字稿
    if (type === 'transcript' || type === 'text') {
      const r = await fetchWithRetry(GEMINI_URL(apiKey), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [{ text: `請針對以下逐字稿內容，用繁體中文生成結構化 JSON 重點整理。\n提取：標題、摘要(150-250字)、時間軸(MM:SS)、心智大綱(最高3層,id用m1/m1-1/m1-1-1)、關鍵觀點金句、行動清單、5-8個關鍵字。\n--- 內容開始 ---\n${transcript}\n--- 內容結束 ---` }]
          }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SUMMARY_SCHEMA, temperature: 0.2 }
        })
      });
      const d: any = await r.json();
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(txt.trim());
    }
 
    // 媒體檔案 / 錄音
    if (type === 'media' || type === 'file' || type === 'recording') {
      const r = await fetchWithRetry(GEMINI_URL(apiKey), {
        method: 'POST', headers: GEMINI_HEADERS,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { data: fileBase64, mimeType } },
              { text: `請仔細分析這份影音（檔名：${fileName || '未命名'}）的語音與視覺內容，即便非中文也請用繁體中文整理。\n生成：標題、摘要(150-250字)、時間軸(MM:SS)、心智大綱(最高3層,id用m1/m1-1/m1-1-1)、關鍵金句、行動指標、關鍵字。` }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SUMMARY_SCHEMA, temperature: 0.2 }
        })
      });
      const d: any = await r.json();
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(txt.trim());
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
      model: 'llama-3.3-nemotron-super-49b-v1.5',
      messages,
      temperature: 0.2,
      max_tokens: 4096
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };
 
    const r = await fetchWithRetry('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    const d: any = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    return d?.choices?.[0]?.message?.content || '';
  };
 
  // ── chat ──
  if (action === 'chat') {
    const messages: any[] = [
      { role: 'system', content: '你是影片摘要工具的 AI 助理，用繁體中文回答關於影片內容的問題。' },
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
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  }
 
  // ── summarize ──
  if (action === 'summarize') {
    const userMsg = type === 'link'
      ? `請根據連結【${transcript}】的標題與知識，用繁體中文生成結構化 JSON。摘要開頭請加「（注意：由連結元資料推演生成）」`
      : `請針對以下內容用繁體中文生成結構化 JSON：\n\n${transcript}`;
 
    const raw = await callNvidia([
      { role: 'system', content: NVIDIA_SYSTEM },
      { role: 'user', content: userMsg }
    ], true);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  }
 
  throw new Error(`不支援的 action: ${action}`);
}
 
// ─── Vite config ──────────────────────────────────────────────────────────────
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
 
          // 只攔截 /api 開頭
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
      },
    },
  };
});