import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

// 載入環境變數以便本地開發使用
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          console.log(`[Vite Dev API] Request: ${req.method} ${req.url}`);
          if (req.url && (req.url.startsWith('/api/') || req.url.startsWith('/api?'))) {
            console.log(`[Vite Dev API] Intercepted API request: ${req.url}`);
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                if (body) {
                  (req as any).body = JSON.parse(body);
                  console.log(`[Vite Dev API] Parsed body keys:`, Object.keys((req as any).body));
                }
              } catch (e) {
                console.error(`[Vite Dev API] Failed to parse body:`, e);
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: '請求 body 解析失敗，請確認 Content-Type 為 application/json' }));
                return;
              }

              // 設定通用 res helpers
              const enhancedRes = res as any;
              enhancedRes.status = (statusCode: number) => {
                res.statusCode = statusCode;
                return enhancedRes;
              };
              enhancedRes.json = (data: any) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return enhancedRes;
              };
              enhancedRes.setHeader = res.setHeader.bind(res);

              try {
                const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
                const apiPath = urlObj.pathname;
                const filePath = path.resolve(process.cwd(), `.${apiPath}.ts`);
                console.log(`[Vite Dev API] Resolving path: ${apiPath} -> ${filePath}`);

                if (fs.existsSync(filePath)) {
                  console.log(`[Vite Dev API] File exists, loading module...`);
                  let module: any;
                  try {
                    module = await server.ssrLoadModule(filePath);
                  } catch (loadErr: any) {
                    console.error(`[Vite Dev API] ssrLoadModule failed:`, loadErr);
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `API 模組載入失敗：${loadErr.message || String(loadErr)}` }));
                    return;
                  }

                  const handler = module.default;
                  if (typeof handler !== 'function') {
                    console.error(`[Vite Dev API] No default export function found in ${filePath}`);
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `API 處理器未正確匯出，請確認 ${apiPath}.ts 有 export default async function handler(req, res)` }));
                    return;
                  }

                  await handler(req, enhancedRes);
                  console.log(`[Vite Dev API] Handler completed successfully`);
                } else {
                  console.error(`[Vite Dev API] API File not found: ${filePath}`);
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `API 路由 ${apiPath} 不存在，請確認 ${filePath} 檔案存在` }));
                }
              } catch (error: any) {
                console.error("[Vite Dev API] Local API Emulator Error:", error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message || String(error) }));
              }
            });
          } else {
            next();
          }
        });
      }
    },
  };
});
