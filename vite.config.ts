import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
 
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
 
// ✅ 直接 import handler，完全不用 ssrLoadModule
import analyzeHandler from './api/analyze';
 
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
 
          // 只攔截 /api 開頭的請求
          if (!url.startsWith('/api')) {
            return next();
          }
 
          console.log(`[API] ${req.method} ${url}`);
 
          // 讀取 body：用 Promise 包裝確保完整等待
          const body = await new Promise<string>((resolve) => {
            // 若 stream 已被消費（readable 已結束），直接 resolve 空字串
            if (!req.readable) {
              return resolve('');
            }
            let data = '';
            req.on('data', (chunk) => { data += chunk; });
            req.on('end', () => resolve(data));
            req.on('error', () => resolve(''));
            // 1 秒 timeout 保護，避免卡死
            setTimeout(() => resolve(data), 1000);
          });
 
          // 解析 JSON body
          if (body) {
            try {
              (req as any).body = JSON.parse(body);
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'JSON 解析失敗' }));
              return;
            }
          } else {
            (req as any).body = {};
          }
 
          // 加入 Express 風格 helpers
          const enhancedRes = res as any;
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
 
          // 根據路徑呼叫對應 handler
          const apiPath = url.split('?')[0];
 
          try {
            if (apiPath === '/api/analyze') {
              await analyzeHandler(req, enhancedRes);
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `找不到 API 路由: ${apiPath}` }));
            }
          } catch (err: any) {
            console.error('[API] 執行錯誤:', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || '伺服器錯誤' }));
            }
          }
        });
      },
    },
  };
});