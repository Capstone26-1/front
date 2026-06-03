import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import express from "express";
import cors from "cors";
import { runAgent } from "./claude.js";

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["http://localhost:3000"];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.post("/api/agent", async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: "message 필드가 필요합니다." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    const result = await runAgent(message, Array.isArray(history) ? history : [], (step) =>
      send({ type: "step", step })
    );
    send({ type: "result", result });
  } catch (err) {
    send({ type: "error", message: err.message });
  }

  res.end();
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP Agent Server → http://localhost:${PORT}`));
