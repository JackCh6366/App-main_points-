/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItem } from "../types";
import { 
  FileText, 
  Mic, 
  Video, 
  Trash2, 
  Clock, 
  ChevronRight, 
  Layers3,
  Calendar
} from "lucide-react";

interface SidebarProps {
  history: HistoryItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function Sidebar({ history, activeId, onSelect, onDelete, onClearAll }: SidebarProps) {
  
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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950/20 border-r border-zinc-200/80 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100" id="sidebar-panel">
      {/* 標題欄 */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers3 className="w-5 h-5 text-indigo-500 shrink-0" />
          <h2 className="text-sm font-bold tracking-tight">歷史整理庫</h2>
        </div>
        
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm("您確定要清除所有歷史整理紀錄嗎？")) {
                onClearAll();
              }
            }}
            className="text-[10px] text-zinc-400 hover:text-red-500 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            清除全部
          </button>
        )}
      </div>

      {/* 列表欄 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
            <Clock className="w-8 h-8 text-zinc-300 dark:text-zinc-700 animate-pulse" />
            <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed font-sans">
              目前尚無任何整理紀錄。開始上傳影音，或貼上文字大綱吧！
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
                    ? "bg-white dark:bg-zinc-900 border-indigo-500/80 shadow-sm shadow-indigo-500/5 text-indigo-950 dark:text-indigo-100"
                    : "bg-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 border-transparent hover:border-zinc-200/50 dark:hover:border-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {/* 點擊選擇大區 */}
                <button
                  onClick={() => onSelect(item.id)}
                  className="flex-1 flex flex-col text-left pr-6 min-w-0"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {getInputIcon(item.inputType, item.fileType)}
                    <span className="text-[10px] font-mono font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[9px]" /> {formatDate(item.timestamp)}
                    </span>
                  </div>
                  
                  <h4 className="text-xs font-semibold truncate leading-snug w-full group-hover:text-indigo-900 dark:group-hover:text-indigo-300">
                    {originalTitle}
                  </h4>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate w-full mt-0.5">
                    {item.summaries.original.summary || "無摘要"}
                  </p>
                </button>

                {/* 刪除按鈕 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("確定欲刪除此筆記錄？")) {
                      onDelete(item.id);
                    }
                  }}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-red-500 p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-all cursor-pointer"
                  title="刪除紀錄"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                
                {!isActive && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:translate-x-0.5 transition-transform group-hover:opacity-0" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部浮水印與資訊 */}
      <div className="p-3 bg-zinc-100/40 dark:bg-zinc-950/30 text-center border-t border-zinc-200/50 dark:border-zinc-800/50">
        <p className="text-[10px] text-zinc-400 font-mono">
          © AI Studio Video Summarizer v1.0
        </p>
      </div>
    </div>
  );
}
