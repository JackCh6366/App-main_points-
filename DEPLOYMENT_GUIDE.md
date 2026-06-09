# Vercel 部署指南 - AI 視頻摘要應用

## 概述

本應用已完成從 Express 後端到 Vercel Serverless Functions 的遷移。支持 **Google Gemini** 和 **NVIDIA NIM** 兩個 AI 服務提供商。

## 架構

```
前端 (React + Vite)
    ↓
Vercel Serverless Function (/api/generate)
    ├─ Google Gemini API (summarize, translate, chat)
    └─ NVIDIA NIM API (text-only operations)
```

## 先決條件

1. **Vercel 帳戶**：https://vercel.com
2. **Google Gemini API Key**：https://aistudio.google.com/apikey
3. **NVIDIA NIM API Key**：https://build.nvidia.com/
4. **Git 推送權限**：確保可以推送至 GitHub

## 環境變數

### 本地開發 (`.env.local`)

```bash
GEMINI_API_KEY=你的_Gemini_API_Key
NVIDIA_API_KEY=你的_NVIDIA_API_Key
```

> ⚠️ **重要**：`.env.local` 已在 `.gitignore` 中，不會被上傳。請勿手動上傳此檔案。

### Vercel 部署

在 Vercel 後台設定以下環境變數：

1. 登入 [Vercel Dashboard](https://vercel.com/dashboard)
2. 進入你的專案
3. 進入 **Settings → Environment Variables**
4. 新增兩個變數：

```
Name: GEMINI_API_KEY
Value: <your_actual_gemini_api_key>
Environments: Production, Preview, Development

Name: NVIDIA_API_KEY
Value: <your_actual_nvidia_api_key>
Environments: Production, Preview, Development
```

5. 點擊 **Save**

## 本地開發

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動開發伺服器

```bash
npm run dev
```

應用會在 http://localhost:5173 啟動

### 3. 測試 AI 提供商

**Gemini 提供商測試**
- 貼上逐字稿 → 應該生成繁體中文摘要
- 上傳音訊/視頻 → 應該分析並生成摘要
- 選擇其他語言 → 應該進行翻譯
- 聊天功能 → 應該能提問並獲得回答

**NVIDIA 提供商測試**
- 貼上逐字稿 → 應該生成摘要（使用推理模型）
- 上傳檔案 → 應該顯示錯誤提示「不支援多媒體」
- 嘗試連結 → 應該顯示錯誤提示「不支援網路搜尋」
- 聊天功能 → 應該能提問並獲得回答

### 4. 構建驗證

```bash
npm run build
npm run lint
```

確保無錯誤和警告。

## 部署至 Vercel

### 方法 1：使用 Vercel CLI（推薦）

```bash
npm install -g vercel
vercel login
vercel
```

Vercel 會自動偵測 `vercel.json` 配置並部署。

### 方法 2：使用 GitHub 連結

1. 推送最新代碼至 GitHub：
   ```bash
   git push origin main
   ```

2. 在 [Vercel Dashboard](https://vercel.com/dashboard) 中：
   - 點擊 **Add New → Project**
   - 選擇你的 GitHub 倉庫
   - 點擊 **Import**
   - Vercel 會自動偵測 `vercel.json` 配置
   - 點擊 **Deploy**

3. 配置環境變數（見上方「Vercel 部署」章節）

4. 部署完成後，應用會在 `https://your-project.vercel.app` 上線

## 部署配置

### `vercel.json` 說明

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "functions": {
    "api/generate.ts": {
      "maxDuration": 60
    }
  }
}
```

**配置說明：**
- `buildCommand`: 構建命令
- `outputDirectory`: 構建輸出目錄
- `framework`: 使用 Vite 框架
- `rewrites`: SPA 路由重寫（所有非 `/api/` 路由指向 index.html）
- `maxDuration`: Serverless Function 最大執行時間（60 秒）

> ⚠️ 如果 API 呼叫需要超過 60 秒（例如大型檔案），請增加 `maxDuration`。

## API 端點規範

### 基礎資訊

- **端點**：`/api/generate`
- **方法**：`POST`
- **Request Header**：`Content-Type: application/json`

### Request Body 範例

**Summarize（摘要）**
```json
{
  "provider": "gemini",
  "action": "summarize",
  "type": "text",
  "transcript": "你的逐字稿...",
  "fileName": "檔案名稱"
}
```

**Translate（翻譯）**
```json
{
  "provider": "gemini",
  "action": "translate",
  "summaryData": {...},
  "targetLanguage": "en"
}
```

**Chat（聊天）**
```json
{
  "provider": "gemini",
  "action": "chat",
  "transcript": "背景逐字稿...",
  "chatHistory": [...],
  "userMessage": "用戶提問"
}
```

### 支援的提供商

| 提供商 | 模型 | 支援操作 | 支援輸入 |
|--------|------|--------|--------|
| **gemini** | `gemini-2.5-flash-lite` | summarize, translate, chat | text, link, media, recording |
| **nvidia** | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | summarize, translate, chat | text only |

## 故障排除

### 1. 環境變數未設定錯誤

**症狀**：`未在環境變數中設定 GEMINI_API_KEY`

**解決方案**：
- 確認已在 Vercel Dashboard 中設定環境變數
- 確認變數名稱完全相符（大小寫敏感）
- 重新部署應用

### 2. API Key 無效

**症狀**：`API 金鑰設定無效或尚未配置`

**解決方案**：
- 驗證 API Key 是否正確複製
- 檢查 API Key 是否已過期
- 從官方服務重新生成新的 Key

### 3. 配額限制

**症狀**：`系統分析額度/頻率已達限制 (Resource Exhausted - 429)`

**解決方案**：
- 等待 30-60 秒後重試
- 檢查 API 配額使用情況
- 考慮升級到付費方案

### 4. 請求超時

**症狀**：`504 Gateway Timeout`

**解決方案**：
- 嘗試使用較小的媒體檔案
- 考慮增加 `vercel.json` 中的 `maxDuration`
- 檢查 Vercel Function 日誌

### 5. 本地開發無法連線

**症狀**：`localhost:5173 無法連接 API`

**解決方案**：
- 確認 `npm run dev` 已啟動
- 檢查 `.env.local` 是否正確配置
- 確認沒有防火牆阻止

## 監控和日誌

### Vercel 日誌

1. 登入 [Vercel Dashboard](https://vercel.com/dashboard)
2. 進入你的專案
3. 點擊 **Deployments**
4. 選擇最新部署
5. 進入 **Functions → api/generate** 查看日誌

### 本地開發日誌

開發伺服器會輸出詳細的 API 調用日誌：

```
[Gemini Summarize] 原始回應前 300 字: ...
[AI API] 遭遇 429/過載。將於 1500ms 後重新嘗試...
```

## 成本估算

### Google Gemini（免費額度內）
- `gemini-2.5-flash-lite`：免費層有配額限制

### NVIDIA NIM（免費額度內）
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`：免費層有配額限制

> 詳細定價請訪問官方服務網站。

## 最佳實踐

1. **本地先測試**：在部署前確保本地開發正常運作
2. **監控日誌**：定期檢查 Vercel 函數日誌以發現問題
3. **API Key 輪換**：定期更新 API Key
4. **錯誤處理**：應用包含完整的錯誤恢復邏輯，但仍應監控異常
5. **版本控制**：所有代碼變更應透過 Git 管理

## 已知限制

| 限制 | 值 | 說明 |
|------|-----|------|
| 媒體檔案大小 | 25 MB | 本地開發限制 |
| Function 超時 | 60 s | Vercel Serverless 限制 |
| 同時請求 | 10 | 預設 Vercel 限制 |
| NVIDIA 輸入 | 文字只 | 推理模型設計限制 |

## 聯繫支援

- **Google Gemini**：https://support.google.com/gemini
- **NVIDIA NIM**：https://docs.nvidia.com/nim/
- **Vercel**：https://vercel.com/help

## 變更日誌

### v1.0.0 (2026-06-09)
- ✅ Express → Vercel Serverless 遷移完成
- ✅ 支持 Google Gemini 提供商
- ✅ 支持 NVIDIA NIM 提供商
- ✅ 多種輸入模式支持
- ✅ 本地開發環境設置
