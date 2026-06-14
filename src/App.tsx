/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  HistoryItem, 
  SupportedLanguage, 
  VideoSummaryJSON, 
  QAPair 
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { AudioRecorder } from "./components/AudioRecorder";
import { 
  Video, 
  Upload, 
  FileText, 
  Mic, 
  Loader2, 
  Sparkles, 
  HelpCircle, 
  Layers3, 
  Check, 
  AlertCircle,
  Menu,
  X
} from "lucide-react";

// 動態流暢 Loading 提示文案
const LOADING_TIPS_GEMINI = [
  "正在啟動 Gemini 2.5 Pro 智能多模態分析引擎...",
  "正在安全解構影音媒體資訊，辨識音訊特質...",
  "正在由 AI 深入理解與聆聽影音，進行極致逐字轉錄與提煉...",
  "AI 正在針對內容主旨、宗旨脈絡進行頂層概要摘要 (summary) 歸納...",
  "正在編製具有精密時間標記的時間軸項目 (timeline)...",
  "正在梳理並編碼最高3層的階層嵌套概念心智大綱 (mindmap)...",
  "正在萃取極具啟發與激勵性的金句與核心論點 (insights)...",
  "正在撰寫具有落地可行性、實操目標明確的下一步行動方案指南...",
  "正在生成語意最貼切的核心關鍵字標籤，即將完整渲染呈現..."
];
const LOADING_TIPS_NVIDIA = [
  "正在啟動 NVIDIA Llama-3.3 Nemotron Super 49B 推理引擎...",
  "正在將文字內容送入 NVIDIA NIM 雲端加速推理...",
  "AI 正在深度解析文字脈絡，進行超高精度語意理解...",
  "正在歸納內容主旨與核心概要摘要 (summary)...",
  "正在編製時間軸項目與階層式心智大綱 (mindmap)...",
  "正在萃取金句與核心論點 (insights)...",
  "正在撰寫行動方案指南與關鍵字標籤，即將完成..."
];

// NVIDIA 不支援的輸入模式（僅限需要 multimodal 的媒體上傳類型）
const NVIDIA_UNSUPPORTED_INPUTS = ["file", "recording"];

export default function App() {
  // 核心狀態
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // 輸入模式
  const [inputType, setInputType] = useState<"file" | "link" | "transcript" | "recording">("file");
  
  // 文字貼上
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [pastedName, setPastedName] = useState("");

  // 網址連結
  const [videoLink, setVideoLink] = useState("");

  // 檔案上載狀態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);

  // 異步處理狀態
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeLang, setActiveLang] = useState<SupportedLanguage>("original");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI 服務提供商
  const [provider, setProvider] = useState<"gemini" | "nvidia">("gemini");

  // 聊天狀態 (聊天紀錄會關聯到 activeItem，但在此以 state 做渲染)
  const [chatHistory, setChatHistory] = useState<QAPair[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // 行動端側邊欄控制
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 同步從 LocalStorage 讀取歷史紀錄
  useEffect(() => {
    const saved = localStorage.getItem("ais_video_summarizer_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as HistoryItem[];
        setHistory(parsed);
        if (parsed.length > 0) {
          setActiveId(parsed[0].id);
        }
      } catch (e) {
        console.error("無法載入歷史紀錄：", e);
      }
    }
  }, []);

  // 當 history 或 activeId 異動，連帶更新對話紀錄狀態與預設語言
  useEffect(() => {
    if (activeId) {
      const activeItem = history.find(h => h.id === activeId);
      if (activeItem) {
        // 如果該項目自帶聊天紀錄
        const chats = (activeItem as any).chats || [];
        setChatHistory(chats);
        // 還原為原文
        setActiveLang("original");
      }
    } else {
      setChatHistory([]);
    }
  }, [activeId, history]);

  // 同步寫入 LocalStorage
  const saveHistoryToStorage = (updatedHistory: HistoryItem[]) => {
    setHistory(updatedHistory);
    localStorage.setItem("ais_video_summarizer_history", JSON.stringify(updatedHistory));
  };

  // 定期切換 Loading 提示文案，緩解用戶等待焦慮
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setLoadingTipIndex(0);
      interval = setInterval(() => {
        const tips = provider === "nvidia" ? LOADING_TIPS_NVIDIA : LOADING_TIPS_GEMINI;
        setLoadingTipIndex((prev) => (prev + 1) % tips.length);
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing]);

  // 處理 Drag 事件
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // 壓縮與轉換檔案為 Base64
  const processSelectedFile = (file: File) => {
    const validMimes = [
      "audio/mp3", "audio/wav", "audio/m4a", "audio/ogg", "audio/mpeg", "audio/x-m4a",
      "video/mp4", "video/webm", "video/quicktime", "audio/webm", "audio/aac", "audio/flac"
    ];

    if (!validMimes.some(mime => file.type.includes(mime) || file.name.endsWith(".m4a") || file.name.endsWith(".mp3") || file.name.endsWith(".mp4"))) {
      setErrorMsg("不支援此檔案類型。請上傳常見的音訊 (mp3, wav, m4a等) 或影片 (mp4, webm) 檔案。");
      return;
    }

    // 限制沙盒 Base64 容量在 25MB 以內
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg("檔案容量超過伺服器 25MB 傳輸限制。請提供較小的格式，或改用【貼上逐字稿/對話】或【現場錄音】功能。");
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const resultStr = reader.result as string;
      const pureBase64 = resultStr.split(",")[1];
      setFileBase64(pureBase64);
      setFileMimeType(file.type || "audio/mp3"); // 備用 MimeType
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  // 安全解析 fetch Response 為 JSON（防止空 body 或截斷回應炸裂）
  const safeParseJson = async (response: Response): Promise<any> => {
    const text = await response.text();
    if (!text || text.trim() === "") {
      throw new Error(
        !response.ok
          ? `伺服器回傳 HTTP ${response.status} 且無任何回應內容，請稍後重試。`
          : "伺服器回傳了空的回應內容，請稍後重試。"
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      // 截取前 200 字，方便偵錯但不暴露過多資訊
      const preview = text.slice(0, 200);
      throw new Error(
        `伺服器回傳了非 JSON 格式的內容（HTTP ${response.status}）。\n回應預覽：${preview}`
      );
    }
  };

  // 1. 整理音影文字主 API 呼叫
  const handleSummarizeSubmit = async () => {
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      let payload: any = {};

      if (inputType === "transcript") {
        if (!pastedTranscript.trim()) {
          throw new Error("請先貼上有效的影音逐字稿文字內容。");
        }
        payload = {
          type: "text",
          transcript: pastedTranscript,
          fileName: pastedName.trim() || `文字彙整_${new Date().toLocaleDateString()}`
        };
      } else if (inputType === "link") {
        if (!videoLink.trim()) {
          throw new Error("請先貼上有效的影音或 YouTube 連結網址。");
        }
        payload = {
          type: "link",
          transcript: videoLink.trim(),
          fileName: `影音連結_${new Date().toLocaleDateString()}`
        };
      } else if (inputType === "file") {
        if (!selectedFile || !fileBase64) {
          throw new Error("請先選擇或拖入要上載處理的音訊/影片檔。");
        }
        payload = {
          type: "media",
          fileBase64: fileBase64,
          mimeType: fileMimeType,
          fileName: selectedFile.name
        };
      } else {
        throw new Error("不支援的整理方式");
      }

      // 加入 AI 提供商及操作行為
      payload.provider = provider;
      payload.action = "summarize";

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await safeParseJson(response);
      if (!response.ok || data.error) {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : (data.error?.message || JSON.stringify(data.error) || "AI 分析影音失敗，請稍候重試");
        throw new Error(errorMessage);
      }

      // 生成歷史紀錄
      const generatedTitle = data.title || (inputType === "file" ? selectedFile?.name : (inputType === "link" ? videoLink : pastedName)) || "影音重點整理";
      const newHistoryItem: HistoryItem = {
        id: "v_" + Date.now(),
        timestamp: Date.now(),
        name: inputType === "file" ? selectedFile!.name : (inputType === "link" ? videoLink.trim() : (pastedName.trim() || `文字彙記`)),
        inputType: inputType,
        fileType: inputType === "file" ? selectedFile!.type : (inputType === "link" ? "link" : "text"),
        originalInput: (inputType === "transcript" || inputType === "text") ? pastedTranscript : (inputType === "link" ? `網址連結: ${videoLink}` : `多媒體長度整理: ${generatedTitle}`),
        summaries: {
          original: data as VideoSummaryJSON
        }
      };

      const updatedHistory = [newHistoryItem, ...history];
      saveHistoryToStorage(updatedHistory);
      setActiveId(newHistoryItem.id);
      
      // 清理輸入暫存
      setPastedTranscript("");
      setPastedName("");
      setVideoLink("");
      setSelectedFile(null);
      setFileBase64(null);

    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "整理影音時發生未知系統異常");
    } finally {
      setIsProcessing(false);
    }
  };

  // 錄音完成後的處理回調
  const handleRecordingComplete = async (base64Data: string, mimeType: string, durationSec: number) => {
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const defaultName = `現場錄音_${new Date().toLocaleDateString()}_${new Date().toLocaleTimeString()}`;
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider,
          action: "summarize",
          type: "media",
          fileBase64: base64Data,
          mimeType: mimeType,
          fileName: defaultName
        })
      });

      const data = await safeParseJson(response);
      if (!response.ok || data.error) {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : (data.error?.message || JSON.stringify(data.error) || "AI 分析錄音重點失敗，請重試");
        throw new Error(errorMessage);
      }

      const newHistoryItem: HistoryItem = {
        id: "rec_" + Date.now(),
        timestamp: Date.now(),
        name: defaultName,
        inputType: "recording",
        fileType: mimeType,
        originalInput: `錄製總時長: ${durationSec}秒`,
        summaries: {
          original: data as VideoSummaryJSON
        }
      };

      const updatedHistory = [newHistoryItem, ...history];
      saveHistoryToStorage(updatedHistory);
      setActiveId(newHistoryItem.id);

    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "處理麥克風智能錄音時失敗");
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. 翻譯整理資料
  const handleTranslationChange = async (targetLang: SupportedLanguage) => {
    if (!activeId) return;
    
    // 如果點擊原文，可直接切換（快取中定存在）
    if (targetLang === "original") {
      setActiveLang("original");
      return;
    }

    const activeItem = history.find(h => h.id === activeId);
    if (!activeItem) return;

    // 判斷是否已經有該語言的快取翻譯，如果有，直接絲滑秒切！
    if (activeItem.summaries[targetLang]) {
      setActiveLang(targetLang);
      return;
    }

    // 發起 API 翻譯
    setIsTranslating(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider,
          action: "translate",
          summaryData: activeItem.summaries.original,
          targetLanguage: targetLang
        })
      });

      const data = await safeParseJson(response);
      if (!response.ok || data.error) {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : (data.error?.message || JSON.stringify(data.error) || "翻譯整理資料失敗");
        throw new Error(errorMessage);
      }

      // 更新歷史紀錄中的多語系快取
      const updatedHistory = history.map((item) => {
        if (item.id === activeId) {
          return {
            ...item,
            summaries: {
              ...item.summaries,
              [targetLang]: data as VideoSummaryJSON
            }
          };
        }
        return item;
      });

      saveHistoryToStorage(updatedHistory);
      setActiveLang(targetLang);

    } catch (e: any) {
      console.error(e);
      alert(e.message || "翻譯發生錯誤，請確認網路與密鑰設定");
    } finally {
      setIsTranslating(false);
    }
  };

  // 3. AI 影音即時解讀問答
  const handleSendChatMessage = async (userMessage: string) => {
    if (!activeId) return;
    const activeItem = history.find(h => h.id === activeId);
    if (!activeItem) return;

    setIsChatLoading(true);
    try {
      const historyForBackend = chatHistory.flatMap(qa => [
        { role: "user", content: qa.question },
        { role: "assistant", content: qa.answer }
      ]);

      const bgContext = activeItem.inputType === "text"
        ? activeItem.originalInput
        : JSON.stringify(activeItem.summaries.original);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider,
          action: "chat",
          transcript: bgContext,
          chatHistory: historyForBackend,
          userMessage: userMessage
        })
      });

      const data = await safeParseJson(response);
      if (!response.ok || data.error) {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : (data.error?.message || JSON.stringify(data.error) || "發送訊息失敗");
        throw new Error(errorMessage);
      }

      const newQAPair: QAPair = {
        question: userMessage,
        answer: data.answer,
        timestamp: Date.now()
      };

      const updatedChatHistory = [...chatHistory, newQAPair];
      setChatHistory(updatedChatHistory);

      // 同時寫進歷史紀錄，這樣切換時會被保存
      const updatedHistory = history.map((item) => {
        if (item.id === activeId) {
          return {
            ...item,
            chats: updatedChatHistory
          };
        }
        return item;
      });
      saveHistoryToStorage(updatedHistory);

    } catch (e: any) {
      console.error(e);
      alert(e.message || "發生問答錯誤");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleDeleteHistory = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    saveHistoryToStorage(updated);
    if (activeId === id) {
      setActiveId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleClearAllHistory = () => {
    saveHistoryToStorage([]);
    setActiveId(null);
  };

  const handleClearChatHistory = () => {
    if (!activeId) return;
    setChatHistory([]);
    const updated = history.map(item => {
      if (item.id === activeId) {
        return { ...item, chats: [] };
      }
      return item;
    });
    saveHistoryToStorage(updated);
  };

  const activeItem = history.find(h => h.id === activeId);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#ececed] font-sans flex flex-col selection:bg-blue-500/20 selection:text-white transition-colors duration-200">
      
      {/* 頂部 Header */}
      <header className="sticky top-0 z-40 bg-[#18181b]/95 backdrop-blur border-b border-[#27272a] px-4 py-3.5 shrink-0 flex items-center justify-between">
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-2 rounded-xl bg-[#09090b] border border-[#27272a] hover:bg-[#27272a]/50 text-gray-400 cursor-pointer"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Layers3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-bold font-mono">BENTO PRO</span>
              </div>
              <h1 className="text-sm font-bold tracking-tight md:text-base text-white">
                影音智能整理與翻譯大師
              </h1>
            </div>
          </div>
        </div>

        {/* 狀態快捷說明與重置按鈕 */}
        <div className="flex items-center gap-3">
          {activeId && (
            <button
              onClick={() => setActiveId(null)}
              className="text-xs px-4 py-2 bg-[#09090b] border border-[#27272a] text-blue-400 rounded-xl font-bold hover:bg-[#27272a] hover:border-blue-500/30 shadow-lg shadow-black/40 transition-all cursor-pointer"
            >
              ＋ 新增影音提取
            </button>
          )}

          <div className="text-gray-500 text-xs font-mono hidden sm:inline-block">
            {provider === "gemini" ? "Gemini 2.5 Pro / Flash" : "NVIDIA Llama-3.3 Nemotron Super 49B"}
          </div>
        </div>
      </header>

      {/* 主體雙欄面板佈局 */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* 手機板 Sidebar 蓋板 (Overlay) */}
        {isSidebarOpen && (
          <div 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
          />
        )}

        {/* 左側欄 (Sidebar) */}
        <aside className={`
          absolute md:relative top-0 bottom-0 left-0 z-40 w-80 shrink-0 h-full transition-transform duration-300 transform
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}>
          <Sidebar 
            history={history}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setIsSidebarOpen(false); // 點選項目後關閉手機側欄
            }}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearAllHistory}
          />
        </aside>

        {/* 右側：主工作視區 (Main Workspace) */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[#0a0a0c]">
          
          {isProcessing ? (
            /* 1. 全域 AI 重點提煉加載狀態 - 便當造型美化板 */
            <div className="h-full flex flex-col items-center justify-center p-8 max-w-xl mx-auto space-y-8 text-center pb-24">
              
              <div className="relative flex items-center justify-center w-28 h-28">
                {/* 科技圓環發光 */}
                <div className="absolute inset-0 rounded-full border-4 border-dashed border-[#27272a] animate-[spin_20s_infinite_linear]"></div>
                <div className="absolute inset-1 rounded-full border-2 border-blue-500/20"></div>
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse"></div>
                <div className="absolute inset-2 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center shadow-inner">
                  <Sparkles className="w-9 h-9 text-blue-400 animate-bounce" />
                </div>
              </div>

              <div className="space-y-3 bg-[#18181b] border border-[#27272a] p-6 rounded-3xl shadow-xl w-full">
                <span className="text-[10px] text-blue-400 font-extrabold tracking-widest uppercase font-mono bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                  多模態精密解析中
                </span>
                <h2 className="text-base md:text-lg font-bold text-white transition-all">
                  {(provider === "nvidia" ? LOADING_TIPS_NVIDIA : LOADING_TIPS_GEMINI)[loadingTipIndex] || (provider === "nvidia" ? LOADING_TIPS_NVIDIA : LOADING_TIPS_GEMINI)[0]}
                </h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {provider === "nvidia"
                    ? "NVIDIA Llama-3.3 Nemotron Super 49B 正在透過 NIM 雲端推理加速基礎設施，深度解析您的文字內容。這通常需要一點時間，請您稍加等候。"
                    : "影音處理非常依賴深度的時空轉換及音軌剖析，Gemini AI 大模型現在正在竭力將整部影音整理為高精密度的 JSON 繁中結構資料。這通常需要一點時間，請您稍加等候，奇蹟即將顯現。"
                  }
                </p>
                
                {/* 進度裝飾線 */}
                <div className="pt-2">
                  <div className="w-full h-1.5 bg-[#09090b] rounded-full overflow-hidden border border-[#27272a]">
                    <div className="h-full bg-blue-500 animate-[pulse_1.5s_infinite] w-[78%] rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  </div>
                </div>
              </div>

            </div>

          ) : activeItem ? (
            /* 2. 顯示現有影音整理儀表板 (Dashboard) */
            <Dashboard 
              activeItem={activeItem}
              activeLang={activeLang}
              isTranslating={isTranslating}
              onLanguageChange={handleTranslationChange}
              qaHistory={chatHistory}
              isChatLoading={isChatLoading}
              onSendChatMessage={handleSendChatMessage}
              onClearChat={handleClearChatHistory}
            />

          ) : (
            /* 3. 引導提交工作區 (Submission Interface) */
            <div className="max-w-3xl mx-auto space-y-6 py-4 pb-24">
              
              {/* 引導標頭 */}
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center text-blue-500 shadow-md">
                  <Sparkles className="w-6 h-6 animate-pulse text-blue-400" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white mb-1">
                  立即開啟您的智能影音筆記之旅
                </h2>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                  支援一鍵上傳短影片與音訊檔案，或貼上字幕逐字稿，甚至是直接用網頁麥克風錄音！隨即享受由 Gemini AI 回餽之多語系時間軸摘要、心智概念樹與智能問答。
                </p>
              </div>

              {/* 四大管道分流按鈕 - Bento 格框風 */}
              <div className="grid grid-cols-2 lg:flex bg-[#18181b] p-1.5 rounded-2xl border border-[#27272a] gap-1.5 shadow-xl">
                {[
                  { id: "file", label: "📁 上傳檔案", desc: "支援 mp3, m4a, wav, mp4" },
                  { id: "link", label: "🔗 影音連結", desc: "貼上 YouTube 或音訊網址" },
                  { id: "transcript", label: "✍️ 貼上字稿", desc: "貼上文字、字幕或紀錄" },
                  { id: "recording", label: "🎙️ 現場錄音", desc: "開啟麥克風現場音訊" }
                ].map((inputM) => (
                  <button
                    key={inputM.id}
                    onClick={() => {
                      const newInputType = inputM.id as any;
                      // 若切換至 NVIDIA 不支援的輸入模式，自動回切為 Gemini
                      if (provider === "nvidia" && NVIDIA_UNSUPPORTED_INPUTS.includes(newInputType)) {
                        setProvider("gemini");
                      }
                      setInputType(newInputType);
                      setErrorMsg(null);
                    }}
                    className={`flex-1 py-3 px-2 rounded-xl text-xs md:text-sm font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                      inputType === inputM.id
                        ? "bg-[#09090b] border border-[#27272a] text-blue-400 shadow-lg shadow-black/50"
                        : "text-gray-400 hover:text-white hover:bg-[#27272a]/20 bg-transparent"
                    }`}
                  >
                    <span className="font-bold">{inputM.label}</span>
                    <span className="text-[10px] opacity-60 font-medium font-sans hidden sm:inline-block">
                      {inputM.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* AI 服務提供商選擇器 */}
              <div className="bg-[#18181b] p-4 rounded-2xl border border-[#27272a] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xs font-bold text-white">AI 服務提供商</h3>
                    <p className="text-[10px] text-gray-400">選擇處理整理與分析的 AI 引擎</p>
                  </div>
                </div>
                
                <div className="flex bg-[#09090b] p-1 rounded-xl border border-[#27272a] w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setProvider("gemini");
                      setErrorMsg(null);
                    }}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      provider === "gemini"
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <span>Google Gemini</span>
                    <span className="text-[9px] opacity-75 font-mono">(gemini-2.5-pro)</span>
                  </button>
                  <button
                    onClick={() => {
                      setProvider("nvidia");
                      setErrorMsg(null);
                      // 若目前輸入模式為 NVIDIA 不支援的類型，自動切至「貼上字稿」
                      if (NVIDIA_UNSUPPORTED_INPUTS.includes(inputType)) {
                        setInputType("transcript");
                      }
                    }}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      provider === "nvidia"
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <span>NVIDIA NIM</span>
                    <span className="text-[9px] opacity-75 font-mono">(llama-3.3-nemotron-super-49b-v1.5)</span>
                  </button>
                </div>
              </div>

              {/* NVIDIA 模式提示橫幅：依輸入模式智慧顯示 */}
              {provider === "nvidia" && NVIDIA_UNSUPPORTED_INPUTS.includes(inputType) && (
                <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 text-amber-200 rounded-2xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <h4 className="font-bold text-amber-300">⚠️ 此輸入模式不支援 NVIDIA NIM</h4>
                    <p className="mt-0.5 leading-relaxed text-amber-200/80">
                      Llama-3.3 Nemotron Super 49B 為純文字模型，<strong>無法直接處理音訊/影片上傳或麥克風錄音</strong>。請切換至「✍️ 貼上字稿」或「🔗 影音連結」模式，或改用 Google Gemini 引擎。
                    </p>
                  </div>
                </div>
              )}

              {/* NVIDIA + 連結模式：顯示精準度說明 */}
              {provider === "nvidia" && inputType === "link" && (
                <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 text-blue-200 rounded-2xl text-xs flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <h4 className="font-bold text-blue-300">💡 連結模式使用提示</h4>
                    <p className="mt-0.5 leading-relaxed text-blue-200/80">
                      NVIDIA 模式將透過抓取連結的標題與描述等元資料，搭配模型知識庫進行智慧推演。精準度略低於 Gemini 的即時 Google 搜尋聯網模式，建議重要內容改用 Google Gemini 以獲得最佳結果。
                    </p>
                  </div>
                </div>
              )}

              {/* 報錯提示橫幅 */}
              {errorMsg && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <h4 className="font-bold">提醒注意事項</h4>
                    <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* 各管道主要提交介面 - 完美深黑 Bento 卡片 */}
              <div className="bg-[#18181b] p-6 rounded-3xl border border-[#27272a] shadow-2xl space-y-4">
                
                {inputType === "file" && (
                  <div className="space-y-4">
                    <div 
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`
                        border-2 border-dashed rounded-2xl p-9 text-center flex flex-col items-center justify-center transition-all cursor-pointer relative gap-4
                        ${dragActive 
                          ? "border-blue-500 bg-blue-500/5" 
                          : "border-[#27272a] hover:border-gray-500 bg-[#09090b]/40"}
                      `}
                    >
                      <input 
                        type="file" 
                        id="audio-video-upload" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept="audio/*,video/*"
                        onChange={handleFileChange}
                      />

                      <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Upload className="w-6 h-6 animate-pulse" />
                      </div>

                      {selectedFile ? (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white flex items-center gap-1.5 justify-center">
                            <Check className="w-4 h-4 text-emerald-400" />
                            已選定檔案: {selectedFile.name}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            容量: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Mime: {selectedFile.type || "N/A"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            拖放音訊或影片至此，或點擊以選擇檔案
                          </p>
                          <p className="text-xs text-gray-400 max-w-xs mx-auto leading-normal">
                            支援 mp3、wav、m4a、aac 或 mp4 (檔案限制少於 25MB 以確保順暢渲染)。
                          </p>
                        </div>
                      )}
                    </div>

                    {selectedFile && (
                      <button
                        onClick={handleSummarizeSubmit}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/30 active:scale-[0.98] transition-all cursor-pointer border border-blue-500/20"
                      >
                        <Sparkles className="w-4 h-4 text-blue-200 fill-current shrink-0" />
                        <span>確認送出並讓 AI 重點整理 (繁體中文)</span>
                      </button>
                    )}
                  </div>
                )}

                {inputType === "link" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="videoLinkInput" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                        請貼上 YouTube 影音網址或公開音訊/影片網址 (必填)
                      </label>
                      <input 
                        type="url" 
                        id="videoLinkInput"
                        value={videoLink}
                        onChange={(e) => setVideoLink(e.target.value)}
                        placeholder="例如: https://www.youtube.com/watch?v=xxxx 或是公開的 mp3 / mp4 線上連結..."
                        className="w-full px-4 py-3 rounded-xl border border-[#27272a] focus:outline-none focus:border-blue-500 bg-[#09090b] text-xs text-white"
                      />
                    </div>

                    <button
                      onClick={handleSummarizeSubmit}
                      disabled={!videoLink.trim()}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/30 active:scale-[0.98] disabled:bg-[#09090b] disabled:text-gray-600 disabled:border-[#27272a] disabled:cursor-not-allowed transition-all cursor-pointer border border-blue-500/20"
                    >
                      <Sparkles className="w-4 h-4 text-blue-200 fill-current shrink-0" />
                      <span>由 AI 一鍵為您分析影音連結並繁中重點整理</span>
                    </button>
                  </div>
                )}

                {inputType === "transcript" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="pastedName" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                        為此段字稿擬定一個主標題 (選填)
                      </label>
                      <input 
                        type="text" 
                        id="pastedName"
                        value={pastedName}
                        onChange={(e) => setPastedName(e.target.value)}
                        placeholder="例如: 智能科技週報主題論述 / 行銷部門週會記錄內容..."
                        className="w-full px-4 py-3 rounded-xl border border-[#27272a] focus:outline-none focus:border-blue-500 bg-[#09090b] text-xs text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="pastedTranscript" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                        直接在此貼上您的影音字幕、會議逐字稿、或長篇文章內容 (必填)
                      </label>
                      <textarea 
                        id="pastedTranscript"
                        rows={11}
                        value={pastedTranscript}
                        onChange={(e) => setPastedTranscript(e.target.value)}
                        placeholder="請將您提取下來的 YouTube 逐字錄音、Podcast 字幕、或是對話記錄段落貼在這邊...（無長度格式限制，AI會完美剖析）"
                        className="w-full px-4 py-3.5 rounded-xl border border-[#27272a] focus:outline-none focus:border-blue-500 bg-[#09090b] text-xs leading-relaxed text-[#ececed] font-mono custom-scrollbar resize-none"
                      />
                    </div>

                    <button
                      onClick={handleSummarizeSubmit}
                      disabled={!pastedTranscript.trim()}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/30 active:scale-[0.98] disabled:bg-[#09090b] disabled:text-gray-600 disabled:border-[#27272a] disabled:cursor-not-allowed transition-all cursor-pointer border border-blue-500/20"
                    >
                      <Sparkles className="w-4 h-4 text-blue-200 fill-current shrink-0" />
                      <span>由 AI 一鍵為您繁中重點整理</span>
                    </button>
                  </div>
                )}

                {inputType === "recording" && (
                  <div className="space-y-2">
                    <AudioRecorder onRecordingComplete={handleRecordingComplete} />
                  </div>
                )}

              </div>

              {/* 智能解答與使用說明 - 精美便當格底 */}
              <div className="p-4.5 bg-[#18181b] border border-[#27272a] rounded-2xl flex items-start gap-3.5 text-xs leading-relaxed text-gray-400">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <div className="space-y-1">
                  <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">使用提示說明</h4>
                  <ul className="list-disc pl-4 space-y-1.5">
                    <li>對於純影音檔案上載，Gemini AI 會智慧聆聽其內部說話脈絡，即便影音非中文，也會在轉換後直接生成完美的繁體中文摘要。</li>
                    <li>新增【影音連結】功能！不論是 YouTube 網址還是公開的 mp3/mp4 線上音源，貼上即可讓 Gemini 結合實時 Google 搜尋自動抓取對應資訊與相關逐字並為您深入分析！</li>
                    <li>若您手頭有超級長片的 YouTube 連結，除了使用網址外，依舊推薦您點擊原廠逐字稿並使用【貼上字稿】方式，這將是又快又精確的整理管道。</li>
                    <li>每次的整理結果和即時對話對都被保存在這台瀏覽器的 localStorage 中，只要您不清空快取，團隊夥伴打開瀏覽器時點擊左側「歷史整理庫」即可瞬間恢復。</li>
                  </ul>
                </div>
              </div>

            </div>
          )}

        </main>

      </div>
    </div>
  );
}
