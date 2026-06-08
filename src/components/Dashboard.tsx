/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { 
  VideoSummaryJSON, 
  SupportedLanguage, 
  HistoryItem,
  QAPair
} from "../types";
import { TimelineSummary } from "./TimelineSummary";
import { MindMapOutline } from "./MindMapOutline";
import { 
  MessageSquare, 
  Send, 
  BookOpen, 
  Clock, 
  TrendingUp, 
  CheckSquare, 
  ChevronRight, 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  Globe2, 
  Sparkles,
  Bot,
  User,
  Loader2
} from "lucide-react";

interface DashboardProps {
  activeItem: HistoryItem;
  activeLang: SupportedLanguage;
  isTranslating: boolean;
  onLanguageChange: (lang: SupportedLanguage) => void;
  // AI 互動問答處理
  qaHistory: QAPair[];
  isChatLoading: boolean;
  onSendChatMessage: (message: string) => void;
  onClearChat: () => void;
}

export function Dashboard({
  activeItem,
  activeLang,
  isTranslating,
  onLanguageChange,
  qaHistory,
  isChatLoading,
  onSendChatMessage,
  onClearChat
}: DashboardProps) {
  
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "mindmap" | "action">("overview");
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  
  const [copied, setCopied] = useState(false);
  
  // 取得當前語言下之重點整理數據
  const currentSummary: VideoSummaryJSON = activeItem.summaries[activeLang] || activeItem.summaries.original;

  // 自動拉到最新聊天訊息底端
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory, isChatLoading]);

  // 控制點擊 Time 標記，自動將該標記與標題複製、並直接問 AI：
  const handleTimeClick = (time: string, title: string) => {
    const question = `我想了解在 ${time} 的章節段落「${title}」，這部分影片裡主要教了什麼、細節為何？可以詳細擴展嗎？`;
    onSendChatMessage(question);
    // 開啟聊天室平滑滑動
    const chatElement = document.getElementById("chat-section");
    if (chatElement) {
      chatElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 快捷問答
  const handleQuickQuestion = (q: string) => {
    onSendChatMessage(q);
  };

  const copyFullMarkdown = () => {
    const md = `
# ${currentSummary.title}
語言版本: ${activeLang.toUpperCase()}

## 💡 核心摘要
${currentSummary.summary}

## ⏰ 時間軸重點
${currentSummary.timeline.map(t => `- **[${t.time}] ${t.title}**: ${t.description}`).join("\n")}

## 💡 關鍵啟發與觀點
${currentSummary.insights.map(i => `- **${i.point}**\n  > "${i.quote}"`).join("\n")}

## 🎯 實操行動指南
${currentSummary.actionItems.map(a => `- **[任務] ${a.task}** \n  *原因與建議*: ${a.reason}`).join("\n")}

## 🏷️ 關鍵字標籤
${currentSummary.keywords.join(", ")}
    `.trim();

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJsonDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentSummary, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${currentSummary.title}_${activeLang}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6" id="dashboard-root">
      
      {/* 標題與基礎導航欄 */}
      <div className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80 shadow-sm space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100/50 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/30 font-bold font-mono">
                {activeItem.inputType === "file" ? "檔案上載" : activeItem.inputType === "recording" ? "即時錄音" : "貼上字稿"}
              </span>
              <span className="text-zinc-400">•</span>
              <span className="text-xs text-zinc-400 font-mono">
                原名: {activeItem.name}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              {currentSummary.title || "未命名影音重點"}
            </h1>
          </div>

          {/* 複製與下載按鈕 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyFullMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 cursor-pointer"
              title="複製整理文章(Markdown格式)"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "已複製" : "複製 Markdown"}</span>
            </button>
            <button
              onClick={handleJsonDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 cursor-pointer"
              title="匯出JSON格式"
            >
              <Download className="w-3.5 h-3.5" />
              <span>匯出 JSON</span>
            </button>
          </div>
        </div>

        {/* 翻譯語系統一面板 */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-bold text-zinc-500 mr-2">
            <Globe2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>智能翻譯整理：</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { code: "original", label: "📄 原文內容" },
              { code: "zh-tw", label: "🇹🇼 繁體中文" },
              { code: "en", label: "🇺🇸 英文" },
              { code: "ja", label: "🇯🇵 日文" },
              { code: "ko", label: "🇰🇷 韓文" }
            ].map((lang) => {
              const reqLang = lang.code as SupportedLanguage;
              const isSelected = activeLang === reqLang;
              const hasCached = activeItem.summaries[reqLang] !== undefined;

              return (
                <button
                  key={lang.code}
                  disabled={isTranslating}
                  onClick={() => onLanguageChange(reqLang)}
                  className={`relative flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 border-indigo-600 text-white shadow shadow-indigo-600/10"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <span>{lang.label}</span>
                  {!hasCached && lang.code !== "original" && (
                    <Sparkles className="w-2.5 h-2.5 text-orange-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          
          {isTranslating && (
            <div className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 animate-pulse ml-auto">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Gemini 翻譯精鍊中...</span>
            </div>
          )}
        </div>

      </div>

      {/* 翻譯載入遮罩 */}
      {isTranslating ? (
        <div className="bg-white dark:bg-zinc-950 p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center space-y-4 shadow-sm animate-pulse">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <div className="space-y-1">
            <h3 className="font-bold text-zinc-800 dark:text-zinc-200 text-base">正在構建多語系智能摘要</h3>
            <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
              Gemini AI 正在努力將本影音的核心觀點、時間軸與心智大綱完美轉換為您指定的外語。我們秉持「信雅達」的翻譯精湛度。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* 左側：主整理視窗 (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80 shadow-sm overflow-hidden">
              
              {/* 四大導覽 Tab 欄 */}
              <div className="bg-zinc-50/50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800/80 p-2 flex gap-1">
                {[
                  { value: "overview", label: "💡 核心摘要", icon: BookOpen },
                  { value: "timeline", label: "⏰ 時間線", icon: Clock },
                  { value: "mindmap", label: "📂 心智大綱", icon: ChevronRight },
                  { value: "action", label: "🎯 行動指南", icon: CheckSquare },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isTabSelected = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value as any)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs md:text-sm font-semibold transition-all cursor-pointer ${
                        isTabSelected
                          ? "bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-bold"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 bg-transparent hover:bg-zinc-100/30"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-zinc-500" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 主要視窗內容 */}
              <div className="p-6 min-h-[400px]">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* 1. 摘要 */}
                    <div className="space-y-2.5">
                      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-3 bg-indigo-500 rounded"></span>
                        <span>影音摘要</span>
                      </h3>
                      <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {currentSummary.summary || "暫無摘要內容"}
                      </p>
                    </div>

                    {/* 2. 關鍵觀點 */}
                    <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-3 bg-indigo-500 rounded"></span>
                        <span>關鍵啟發觀點 (Insights)</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentSummary.insights.map((ins, i) => (
                          <div 
                            key={i} 
                            style={{ animationDelay: `${i * 0.1}s` }}
                            className="bg-zinc-50/60 dark:bg-zinc-900/30 p-4 rounded-xl border border-zinc-150 dark:border-zinc-800/80 hover:scale-[1.01] transition-all"
                          >
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendingUp className="w-4 h-4 text-orange-500 shrink-0" />
                              <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                                觀點 {i + 1}
                              </h4>
                            </div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                              {ins.point}
                            </p>
                            <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-600 pl-3 text-xs italic text-zinc-500 dark:text-zinc-400 leading-relaxed">
                              &ldquo;{ins.quote}&rdquo;
                            </blockquote>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. 關鍵字標籤 */}
                    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/50 space-y-2">
                      <h4 className="text-xs font-bold text-zinc-500">核心關鍵字標籤：</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {currentSummary.keywords.map((kw, i) => (
                          <span 
                            key={i} 
                            className="text-xs px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium transition-colors"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {activeTab === "timeline" && (
                  <TimelineSummary 
                    timeline={currentSummary.timeline} 
                    onTimeClick={handleTimeClick}
                  />
                )}

                {activeTab === "mindmap" && (
                  <MindMapOutline nodes={currentSummary.mindmap} />
                )}

                {activeTab === "action" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          可落地實踐行動計劃
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto pr-1">
                      {currentSummary.actionItems.map((item, i) => (
                        <div 
                          key={i}
                          className="bg-zinc-50/40 dark:bg-zinc-900/10 border border-zinc-100 dark:border-zinc-800/80 p-4 rounded-xl flex items-start gap-3.5 shadow-sm"
                        >
                          <input 
                            type="checkbox" 
                            id={`opt-action-${i}`}
                            className="w-4 h-4 mt-1 rounded text-violet-600 bg-zinc-100 border-zinc-300 focus:ring-violet-500 cursor-pointer"
                          />
                          <div className="space-y-1">
                            <label 
                              htmlFor={`opt-action-${i}`} 
                              className="text-sm font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer select-none"
                            >
                              {item.task}
                            </label>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                              <span className="font-semibold text-zinc-400 dark:text-zinc-500 mr-1">
                                [行動建議及原因]:
                              </span>
                              {item.reason}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* 右側：影音 AI 對談互動聊天室 (4 cols on lg) */}
          <div className="lg:col-span-4" id="chat-section">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80 shadow-sm flex flex-col h-[585px]">
              
              {/* 聊天室 Header */}
              <div className="p-4 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-500" />
                  <div>
                    <h3 className="text-xs md:text-sm font-bold">影音 AI 專屬助理</h3>
                    <p className="text-[10px] text-zinc-400 font-mono">基於當前影音內容問答</p>
                  </div>
                </div>
                {qaHistory.length > 0 && (
                  <button
                    onClick={onClearChat}
                    className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="清空聊天對話"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 訊息渲染區 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {qaHistory.length === 0 ? (
                  <div className="h-full flex flex-col justify-between py-4">
                    {/* 迎賓說明與快捷問題 */}
                    <div className="space-y-4 text-center my-auto">
                      <div className="mx-auto w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          解答您對這部影音的所有困惑
                        </p>
                        <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-normal">
                          您可以詢問特定章節、行動計劃，或是讓 AI 進一步補充、舉例、甚至是翻譯解答。
                        </p>
                      </div>
                    </div>

                    {/* 快捷對話按鈕 */}
                    <div className="space-y-2 mt-auto">
                      <span className="text-[10px] font-bold text-zinc-400 text-left block px-1">
                        猜你想問的快捷問題：
                      </span>
                      <div className="space-y-1.5">
                        {[
                          "此影片提到什麼核心問題？",
                          "如何今天就著手影片提到的行動點？",
                          "可以幫我進一步拓展其中最大的觀點嗎？"
                        ].map((qLabel, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuickQuestion(qLabel)}
                            className="w-full text-left p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 text-[11px] text-zinc-600 dark:text-zinc-400 font-medium tracking-wide flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.01]"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="truncate">{qLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="space-y-4">
                    {qaHistory.map((qa, index) => (
                      <div key={index} className="space-y-3">
                        {/* 使用者訊息 */}
                        <div className="flex items-start gap-2.5 justify-end">
                          <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl p-3 text-xs leading-relaxed shadow-sm">
                            <p className="whitespace-pre-wrap">{qa.question}</p>
                          </div>
                          <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">
                            <User className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        {/* AI 回覆訊息 */}
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] shrink-0 font-bold border border-zinc-200/50 dark:border-zinc-700">
                            <Bot className="w-3.5 h-3.5 text-indigo-500" />
                          </div>
                          <div className="max-w-[85%] bg-zinc-50 dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800/60 rounded-2xl p-3 text-xs leading-relaxed shadow-sm">
                            <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                              {qa.answer}
                            </p>
                          </div>
                        </div>

                      </div>
                    ))}

                    {/* AI 載入轉圈 */}
                    {isChatLoading && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800/60 rounded-2xl px-4 py-2 text-xs text-zinc-400">
                          助理正在深度思考影音文字細節...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* 聊天室輸入列 */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim() || isChatLoading) return;
                  onSendChatMessage(chatInput);
                  setChatInput("");
                }}
                className="p-3 border-t border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0"
              >
                <div className="relative flex items-center">
                  <input
                    type="text"
                    disabled={isChatLoading}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="問問這部影片裡的事情..."
                    className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-indigo-500 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-100 disabled:bg-zinc-100 dark:disabled:bg-zinc-950 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="absolute right-1.5 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 transition-colors active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              </form>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
