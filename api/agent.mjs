import { runAgent, createSessionCache } from "../server/claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { message, history, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: "message 필드가 필요합니다." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const cache = createSessionCache();

  try {
    const result = await runAgent(
      message,
      Array.isArray(history) ? history : [],
      (step) => send({ type: "step", step }),
      cache
    );
    send({ type: "result", result });
  } catch (err) {
    send({ type: "error", message: err.message });
  }

  res.end();
}

export const config = {
  maxDuration: 60,
};
