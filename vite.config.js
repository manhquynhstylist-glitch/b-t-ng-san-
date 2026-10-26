import { defineConfig, loadEnv } from "vite";
import configHandler from "./api/config.js";
import leadHandler from "./api/leads.js";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "SUPABASE_");
  for (const [key, value] of Object.entries(env))
    if (!process.env[key]) process.env[key] = value;
  return {
    plugins: [
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const path = req.url?.split("?")[0];
            if (!["/api/config", "/api/leads"].includes(path)) return next();
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return res;
            };
            if (path === "/api/config") return configHandler(req, res);
            try {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 16384) {
                  res.status(413).json({ error: "Yêu cầu quá lớn." });
                  return;
                }
                chunks.push(chunk);
              }
              req.body = Buffer.concat(chunks).toString();
              await leadHandler(req, res);
            } catch {
              if (!res.writableEnded)
                res.status(400).json({ error: "Dữ liệu không hợp lệ." });
            }
          });
        },
      },
    ],
  };
});
