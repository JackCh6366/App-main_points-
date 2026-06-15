import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const summaryResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "基於本影音或內容，自動生成的主題或最切合的標題。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
    },
    summary: {
      type: Type.STRING,
      description: "500-800字以上極其詳盡、結構清晰且分段的繁體中文深度概要。要能透徹分析內容宗旨、背景脈絡、核心論點與結論，請使用豐富描述性長句，絕對不可簡略或只給出一小段。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
    },
    timeline: {
      type: Type.ARRAY,
      description: "本內容或影音循序漸進的完整詳細時間軸摘要。請詳細覆蓋整個影音的所有核心段落（至少 8-15 個時間點，若內容極短則依實際長度）。如果有明確秒數，請務必精準標記(例如 00:15)，若無可概略估算(例如 00:00, 01:30等) (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING, description: "時間標記, 格式必須如 MM:SS 或 HH:MM:SS" },
          title: { type: Type.STRING, description: "此項目的精炼大綱主題。必須是繁體中文 (台灣習慣之繁體中文)" },
          description: { type: Type.STRING, description: "該段落主要談論細節、要點概要。必須是繁體中文 (台灣習慣之繁體中文)，且敘述應儘可能詳實完整，以 2-4 句詳細記錄該時段的關鍵對話、細節與重要論點，不要簡化" },
        },
        required: ["time", "title", "description"],
      },
    },
    mindmap: {
      type: Type.ARRAY,
      description: "基於本內容的階層式樹狀重點大綱，最多支持3層巢狀結構。一級核心主題必須在 5-8 個之間。請確保所有節點的 label 都使用具體、描述性的詞句 (約 10-25 字，包含行動或實質內容，例如「採用 React 進行高效組件開發」而非單純的「技術」或「組件」)，以確保心智圖資訊量豐富，絕對不可敷衍簡略。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1'" },
          label: { type: Type.STRING, description: "一級核心主題名稱 (10-25字)。必須是繁體中文 (台灣習慣之繁體中文)" },
          children: {
            type: Type.ARRAY,
            description: "二級核心重點。每個一級主題下應包含至少 2-4 個二級節點",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1-1'" },
                label: { type: Type.STRING, description: "二級核心重點名稱 (10-25字)。必須是繁體中文 (台灣習慣之繁體中文)" },
                children: {
                  type: Type.ARRAY,
                  description: "三級關鍵細節。每個二級重點下應包含至少 2-4 個三級節點，詳細記錄具體細節",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "唯一識別碼 e.g. 'm1-1-1'" },
                      label: { type: Type.STRING, description: "三級關鍵細節描述 (15-30字)，請儘可能完整詳細描述具體細節，不要簡略。必須是繁體中文 (台灣習慣之繁體中文)" },
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
      description: "影音或內容中的關鍵觀點與金句 quote，請提煉 4-6 個極具啟發與激勵性的項目，以利深度閱讀。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          point: { type: Type.STRING, description: "核心論點或啟發，請使用詳細的繁體中文 (台灣習慣之繁體中文) 說明" },
          quote: { type: Type.STRING, description: "對應的精闢金句或原話重現/總結，必須是繁體中文 (台灣習慣之繁體中文)" },
        },
        required: ["point", "quote"],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      description: "本影音提出的下一步行動、可實踐的目標指引 e.g. 會議行動、學習任務等，請列出 4-6 個具體項目。必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING, description: "具體的行動任務，必須是繁體中文 (台灣習慣之繁體中文)" },
          reason: { type: Type.STRING, description: "做此任務的原因、關鍵價值與建議落實方式，敘述應詳盡充實，必須是繁體中文 (台灣習慣之繁體中文)" },
        },
        required: ["task", "reason"],
      },
    },
    keywords: {
      type: Type.ARRAY,
      description: "本內容的主題關鍵字列表，5-8個，必須是繁體中文 (台灣習慣之繁體中文) (必填)",
      items: {
        type: Type.STRING,
      },
    },
  },
  required: ["title", "summary", "timeline", "mindmap", "insights", "actionItems", "keywords"],
};

async function run() {
  const url = "https://www.youtube.com/watch?v=kYJ4aVqR-u0";
  
  // Simulated metadata (English title like we get on Vercel US server)
  const meta = {
    title: "Ku's Dream French Ban-Doh Challenge: 24 Hours for French People to Experience Classic Taiwanese Ban-Doh Cuisine and Cultural Exchange",
    author_name: "Ku's dream酷的夢-"
  };
  console.log("Simulated Metadata:", meta);

  console.log("Step 1: Google Search");
  const searchPrompt = `
你是一位優秀的網頁資訊檢索與內容探勘大師。
我們目標是為特定網址：【${url}】整理精確重點。
系統已預抓到該網址的資訊：
- 標題：【${meta.title}】
- 作者/來源：【${meta.author_name}】
- 原始連結：【${url}】
 
請你使用內建的 Google 搜尋工具，認真查詢該影片/網頁【${meta.title}】的實際詳細背景。
要求：
1. 必須查到該影片/網頁的正確中英文標題、講者 (與創作者)、發佈頻道、以及核心宗旨。
2. 盡可能在公開網路搜集該影片的章節、時間標記大綱、分段要點、公開文字稿、或網路上對此影片的所有重點解讀與摘要。
3. 如果是在 YouTube，請結合你的搜尋，重組出該影片一條一條的詳細時間軸章節（格式如 MM:SS）與各節內容。
請你使用「繁體中文 (Traditional Chinese，台灣習慣用語)」將上述查找到的具體事實，編製成一篇非常完整、客觀、且高含金量的背景資料白皮書報告。
`;

  const searchResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [searchPrompt],
    config: {
      systemInstruction: "你是一個專業聯網精準檢索與事實彙整機器人。負責深入挖掘各類 YouTube 影片與網頁的文字內容與分段章節，並拒絕任何天馬行空的想像，所有敘述必須基於搜尋到的網頁事實，且所有回答皆必須使用台灣習慣之繁體中文。",
      temperature: 0.2,
      tools: [{ googleSearch: {} }]
    }
  });

  const groundedBackground = searchResponse.text || "";
  console.log("Grounded Background length:", groundedBackground.length);

  console.log("Step 2: Generate Structured Summary using gemini-2.5-flash");
  const promptText = `
你是一位頂級的影音智慧重點整理與學習大師。
以下是第一階段聯網檢索所獲得關於連結【${url}】的真實背景全文、可能的大綱或轉逐字稿資料：
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
- 提取最富主題代表性的 5-8 個「關鍵字」 (keywords)。
`;

  try {
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [promptText],
      config: {
        systemInstruction: "你是一個專業多國語文音訊與影片分析整理機器人。你必須以繁體中文 (台灣習慣用語) 進行所有回覆，確保轉換為最精緻且內容極其詳盡結構化的繁體中文 JSON，嚴禁簡體字及中國大陸用語，如「信息」、「菜單」、「鏈接」、「優化」、「視頻」、「音頻」、「屏幕」應轉換為「資訊」、「選單」、「連結」、「最佳化」、「影片」、「音訊」、「螢幕」等。",
        responseMimeType: "application/json",
        responseSchema: summaryResponseSchema,
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });

    const textResult = geminiResponse.text;
    console.log("Full response text length:", textResult?.length);
    console.log("Response text:\n", textResult);
  } catch (err) {
    console.error("Error generating or parsing content:", err);
  }
}

run();
