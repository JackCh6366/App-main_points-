import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 載入 .env 與 .env.local 環境變數至 process.env，供 API 讀取
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'vercel-api-emulator',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/generate')) {
              try {
                // 僅在 POST 請求時解析 Body
                let body = {};
                if (req.method === 'POST') {
                  const buffers = [];
                  for await (const chunk of req) {
                    buffers.push(chunk);
                  }
                  const data = Buffer.concat(buffers).toString();
                  if (data) {
                    try {
                      body = JSON.parse(data);
                    } catch (e) {
                      body = {};
                    }
                  }
                }

                // 模擬 VercelRequest 與 VercelResponse
                const vercelReq = req as any;
                vercelReq.body = body;

                const vercelRes = res as any;
                vercelRes.status = (statusCode: number) => {
                  res.statusCode = statusCode;
                  return vercelRes;
                };
                vercelRes.json = (data: any) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return vercelRes;
                };

                // 動態載入 Serverless Function 程式碼
                const apiModule = await server.ssrLoadModule('./api/generate.ts');
                await apiModule.default(vercelReq, vercelRes);
                return;
              } catch (error: any) {
                console.error('Local API Emulation Error:', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
                return;
              }
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
