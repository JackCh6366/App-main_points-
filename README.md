<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d53baa33-fd90-456a-a402-6ac813dd7b78

## Run Locally

**Prerequisites:** Node.js (v18 or higher recommended)

1. **安裝依賴套件 (Install dependencies):**
   ```bash
   npm install
   ```
2. **設定環境變數 (Set environment variables):**
   複製 `.env.example` 為 `.env.local`，並填入您的 API 金鑰：
   * `GEMINI_API_KEY`: 來自 Google AI Studio
   * `NVIDIA_API_KEY`: 來自 NVIDIA Build Catalog
3. **啟動開發伺服器 (Run the app):**
   ```bash
   npm run dev
   ```

## Vercel 部署注意事項 (Vercel Deployment)

部署至 Vercel 時，請務必在 Vercel 專案後台的 **Environment Variables** 設定中新增以下環境變數：
1. `GEMINI_API_KEY`
2. `NVIDIA_API_KEY`

這些環境變數將會由 Vercel Serverless Functions (`api/analyze.ts`) 自動讀取並用於 API 呼叫。
