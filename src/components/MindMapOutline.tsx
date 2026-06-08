/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { MindMapNode } from "../types";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Layers, Milestone } from "lucide-react";

interface NodeProps {
  key?: string;
  node: MindMapNode;
  level: number;
}

function MindMapTreeNode({ node, level }: NodeProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  // 根據不同層級調整縮排和樣式
  const getIndentClass = () => {
    if (level === 0) return "pl-0";
    if (level === 1) return "pl-6 md:pl-8 border-l border-zinc-200/80 dark:border-zinc-800/80 ml-3";
    return "pl-6 md:pl-8 border-l border-zinc-100/50 dark:border-zinc-800/30 ml-3 border-dashed";
  };

  const getHeaderStyle = () => {
    if (level === 0) {
      return "bg-gradient-to-r from-zinc-50 to-zinc-100/50 dark:from-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm text-zinc-900 dark:text-zinc-100 font-semibold mb-3";
    }
    if (level === 1) {
      return "hover:bg-zinc-50 dark:hover:bg-zinc-900/40 p-2.5 rounded-lg text-zinc-800 dark:text-zinc-200 font-medium my-1.5 flex items-center gap-2";
    }
    return "text-zinc-600 dark:text-zinc-400 text-sm py-1 pl-2 hover:text-zinc-900 dark:hover:text-zinc-200";
  };

  const getIcon = () => {
    if (level === 0) {
      return isOpen ? (
        <FolderOpen className="w-5 h-5 text-indigo-500 shrink-0" />
      ) : (
        <Folder className="w-5 h-5 text-indigo-400 shrink-0" />
      );
    }
    if (level === 1) {
      return <Milestone className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    return <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  };

  return (
    <div className={`my-1 transition-all duration-200 ${getIndentClass()}`} id={`node-${node.id}`}>
      <div 
        className={`${getHeaderStyle()} flex items-center justify-between cursor-pointer select-none transition-all`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          {getIcon()}
          <span>{node.label}</span>
        </div>
        {hasChildren && (
          <div className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="overflow-hidden transition-all duration-300">
          {node.children!.map((child) => (
            <MindMapTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface MindMapOutlineProps {
  nodes: MindMapNode[];
}

export function MindMapOutline({ nodes }: MindMapOutlineProps) {
  const [expandAllKey, setExpandAllKey] = useState(1);

  if (!nodes || nodes.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 font-mono text-sm">
        無架構式大綱資料
      </div>
    );
  }

  const handleReset = () => {
    // 透過改變 Key 來重新渲染子元件以達到全展開功能
    setExpandAllKey(prev => prev + 1);
  };

  return (
    <div className="space-y-4" id="mindmap-container">
      <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">階層式大綱 (心智概念樹)</h3>
        </div>
        <button 
          onClick={handleReset}
          className="text-xs px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 transition-colors"
        >
          還原全部展開
        </button>
      </div>

      <div key={expandAllKey} className="space-y-4 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
        {nodes.map((rootNode) => (
          <MindMapTreeNode key={rootNode.id} node={rootNode} level={0} />
        ))}
      </div>
    </div>
  );
}
