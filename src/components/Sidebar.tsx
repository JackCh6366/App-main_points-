/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { HistoryItem } from "../types";
import { 
  FileText, 
  Mic, 
  Video, 
  Trash2, 
  Clock, 
  ChevronRight, 
  Layers3,
  Calendar,
  X
} from "lucide-react";

interface SidebarProps {
  history: HistoryItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function Sidebar({ history, activeId, onSelect, onDelete, onClearAll }: SidebarProps) {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // 依輸入種類返回對應圖示
  const getInputIcon = (type: "file" | "recording" | "text", fileType?: string) => {
    if (type === "text") {
      return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    if (type === "recording") {
      return <Mic className="w-4 h-4 text-red-500 shrink-0" />;
    }
    if (fileType && fileType.startsWith("video")) {
      return <Video className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    return <Mic className="w-4 h-4 text-indigo-500 shrink-0" />;
  };

  // 格式化時間戳記
  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] border-r border-[#27272a] text-zinc-100" id="sidebar-panel">
      {/* 標題欄 */}
      <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-[#111113]">
        <div className="flex items-center gap-2">
          <Layers3 className="w-4 h-4 text-blue-400 shrink-0" />
          <h2 className="text-xs font-bold tracking-tight text-gray-200">歷史彙整大庫</h2>
        </div>
        
        {history.length > 0 && (
          <div className="flex items-center">
            {isConfirmingClear ? (
              <div className="flex items-center gap-1 animate-pulse">
                <button
                  onClick={() => {
                    onClearAll();
                    setIsConfirmingClear(false);
                  }}
                  className="text-[9px] text-red-400 font-extrabold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 cursor-pointer"
                >
                  確認清空
                </button>
                <button
                  onClick={() => setIsConfirmingClear(false)}
                  className="text-[9px] text-zinc-400 font-semibold bg-zinc-800 px-2 py-0.5 rounded cursor-pointer"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsConfirmingClear(true)}
                className="text-[10px] text-gray-400 hover:text-red-400 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-zinc-800 border border-transparent hover:border-red-500/10 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3 text-gray-500" />
                清空全部
              </button>
            )}
          </div>
        )}
      </div>

      {/* 列表欄 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
            <Clock className="w-8 h-8 text-zinc-800 animate-pulse" />
            <p className="text-xs text-zinc-500 leading-relaxed font-sans">
              目前無任何歷史整理筆記。<br />開始由右側上傳或貼上網址吧！
            </p>
          </div>
        ) : (
          history.map((item) => {
            const isActive = activeId === item.id;
            const originalTitle = item.summaries.original.title || item.name;
            
            return (
              <div
                key={item.id}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? "bg-[#18181b] border-blue-500 shadow-lg shadow-blue-500/5 text-white"
                    : "bg-transparent hover:bg-zinc-900 border-transparent hover:border-[#27272a] text-zinc-300"
                }`}
              >
                {/* 點擊選擇大區 */}
                <button
                  onClick={() => onSelect(item.id)}
                  className="flex-1 flex flex-col text-left pr-6 min-w-0"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {getInputIcon(item.inputType, item.fileType)}
                    <span className="text-[10px] font-mono font-medium text-zinc-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[9px]" /> {formatDate(item.timestamp)}
                    </span>
                  </div>
                  
                  <h4 className="text-xs font-semibold truncate leading-snug w-full group-hover:text-blue-400">
                    {originalTitle}
                  </h4>
                  <p className="text-[10px] text-zinc-500 truncate w-full mt-0.5 font-sans">
                    {item.summaries.original.summary || "無摘要描述"}
                  </p>
                </button>

                {/* 刪除按鈕 */}
                {deletingId === item.id ? (
                  <div className="absolute right-2 flex items-center gap-1 bg-[#1c1c1f] border border-red-500/20 p-1 rounded-lg z-20 shadow-xl shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                        setDeletingId(null);
                      }}
                      className="text-[9px] bg-red-650 hover:bg-red-500 text-white font-bold px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      確認
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(null);
                      }}
                      className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      否
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(item.id);
                    }}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-red-400 p-1.5 rounded hover:bg-zinc-800 text-zinc-500 transition-all cursor-pointer"
                    title="刪除紀錄"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                
                {!isActive && deletingId !== item.id && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:translate-x-0.5 transition-transform group-hover:opacity-0" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部資訊 */}
      <div className="p-3 bg-zinc-950/20 text-center border-t border-[#27272a]">
        <p className="text-[10px] text-zinc-600 font-mono">
          © AI Studio Video Summarizer v1.0
        </p>
      </div>
    </div>
  );
}
