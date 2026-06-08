/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimelineItem } from "../types";
import { Clock, Copy, Check, Play } from "lucide-react";
import { useState } from "react";

interface TimelineSummaryProps {
  timeline: TimelineItem[];
  onTimeClick?: (time: string, title: string) => void;
}

export function TimelineSummary({ timeline, onTimeClick }: TimelineSummaryProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 font-mono text-sm">
        無時間軸摘要資料
      </div>
    );
  }

  return (
    <div className="space-y-6" id="timeline-container">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">精準時間軸摘要</h3>
        </div>
        <span className="text-xs text-zinc-400 font-mono">
          共 {timeline.length} 個分段重點
        </span>
      </div>

      <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-4 md:ml-6 pl-6 space-y-8 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
        {timeline.map((item, index) => (
          <div key={index} className="relative group" id={`timeline-item-${index}`}>
            {/* 時間軸圓圈點 */}
            <div className="absolute -left-[31px] md:-left-[35px] top-1.5 w-5 h-5 rounded-full bg-white dark:bg-zinc-950 border-2 border-emerald-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
              <Clock className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
            </div>

            {/* 卡片內容 */}
            <div className="bg-zinc-50/60 dark:bg-zinc-900/30 hover:bg-white dark:hover:bg-zinc-900/90 border border-zinc-100 dark:border-zinc-800/80 p-4 rounded-xl shadow-sm transition-all duration-200 hover:shadow">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => onTimeClick?.(item.time, item.title)}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 border border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-mono text-xs font-semibold cursor-pointer transition-colors active:scale-95"
                    title="點擊此段落與AI討論"
                  >
                    <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                    <span>{item.time}</span>
                  </button>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {item.title}
                  </h4>
                </div>

                <button
                  onClick={() => handleCopy(index, `[${item.time}] ${item.title}: ${item.description}`)}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
                  title="複製此段大綱"
                >
                  {copiedIndex === index ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
