import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
 
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
 
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
 
          // 修正：用 startsWith('/api') 而非 '/api/'，才能匹配 /api/analyze
          if (!url.startsWith('/api')) {
            return next();
          }
 
          console.log(`[Vite Dev API] ${req.method} ${url}`);
 
          // 讀取 request body
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
 
            // 解析 JSON body
            if (body) {
              try {
                (req as any).body = JSON.parse(body);
              } catch (e) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Request body 解析失敗，請確認 Content-Type 為 application/json' }));
                return;
              }
            } else {
              (req as any).body = {};
            }
 
            // 加入 res.json / res.status helpers
            const enhancedRes = res as any;
            if (!enhancedRes.json) {
              enhancedRes.status = (code: number) => {
                res.statusCode = code;
                return enhancedRes;
              };
              enhancedRes.json = (data: any) => {
                if (!res.headersSent) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                }
                return enhancedRes;
              };
            }
 
            try {
              // 取得純路徑（去掉 query string）
              const urlObj = new URL(url, `http://${req.headers.host || 'localhost'}`);
              const apiPath = urlObj.pathname; // e.g. /api/analyze
 
              // 嘗試對應 ./api/analyze.ts
              const filePath = path.resolve(process.cwd(), `.${apiPath}.ts`);
              console.log(`[Vite Dev API] 尋找模組: ${filePath}`);
 
              if (!fs.existsSync(filePath)) {
                console.error(`[Vite Dev API] 找不到檔案: ${filePath}`);
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `API 路由 ${apiPath} 不存在，請確認 ${filePath} 存在` }));
                return;
              }
 
              let module: any;
              try {
                module = await server.ssrLoadModule(filePath);
              } catch (loadErr: any) {
                console.error(`[Vite Dev API] 模組載入失敗:`, loadErr);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `API 模組載入失敗：${loadErr.message || String(loadErr)}` }));
                return;
              }
 
              const handler = module.default;
              if (typeof handler !== 'function') {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `${apiPath}.ts 缺少 export default async function handler(req, res)` }));
                return;
              }
 
              await handler(req, enhancedRes);
              console.log(`[Vite Dev API] 處理完成: ${apiPath}`);
 
            } catch (error: any) {
              console.error('[Vite Dev API] 執行錯誤:', error);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message || String(error) }));
              }
            }
          });
        });
      }
    },
  };
});