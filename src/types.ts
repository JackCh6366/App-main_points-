
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
 
// 影音智能整理主要資料結構
export interface TimelineItem {
  time: string; // 格式如 "01:23" 或 "00:00"
  title: string;
  description: string;
}
 
export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}
 
export interface InsightItem {
  point: string;
  quote: string; // 影音精彩亮點、論點
}
 
export interface ActionItem {
  task: string;
  reason: string;
}
 
export interface VideoSummaryJSON {
  title: string;
  summary: string;
  timeline: TimelineItem[];
  mindmap: MindMapNode[];
  insights: InsightItem[];
  actionItems: ActionItem[];
  keywords: string[];
}
 
// 快取/多語言整理結構
export interface MultiLangSummaries {
  original: VideoSummaryJSON;
  "zh-tw"?: VideoSummaryJSON;
  en?: VideoSummaryJSON;
  ja?: VideoSummaryJSON;
  ko?: VideoSummaryJSON;
}
 
export type SupportedLanguage = "original" | "zh-tw" | "en" | "ja" | "ko";
 
export interface HistoryItem {
  id: string;
  timestamp: number;
  name: string;
  // 補齊所有實際使用的 inputType 值
  inputType: "file" | "recording" | "text" | "link" | "transcript";
  fileType?: string; // e.g. "audio/mp3", "video/mp4", "text", "link"
  originalInput: string; // 文字逐字稿或是檔名摘要
  summaries: MultiLangSummaries; // 儲存各語系整理結果
  chats?: QAPair[]; // 聊天記錄
}
 
// 供與 AI 單點問答使用的問答對
export interface QAPair {
  question: string;
  answer: string;
  timestamp: number;
}