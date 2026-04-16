/**
 * Vite plugin that proxies /api/text2sql/* requests to the FastAPI backend
 * running on http://localhost:8100.
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";

const BACKEND_HOST = "localhost";
const BACKEND_PORT = 8100;
const PREFIX = "/api/text2sql";

function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetPath: string,
): void {
  const options: http.RequestOptions = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${BACKEND_HOST}:${BACKEND_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`[text2sql-proxy] backend error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        success: false,
        error: `Text2SQL 后端服务不可用 (${BACKEND_HOST}:${BACKEND_PORT})。请确认 FastAPI 已启动。`,
      }),
    );
  });

  req.pipe(proxyReq, { end: true });
}

export function createText2SQLProxyPlugin(): Plugin {
  return {
    name: "vite-text2sql-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (!url.pathname.startsWith(PREFIX)) {
          next();
          return;
        }
        proxyRequest(req, res, url.pathname + url.search);
      });
    },
  };
}
