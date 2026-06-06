const SERVER_URL = process.env.REACT_APP_API_URL !== undefined ? process.env.REACT_APP_API_URL : "http://localhost:3001";

export async function runAgent(userMessage, history, onStep, sessionId) {
  const response = await fetch(`${SERVER_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage, history: history || [], sessionId }),
  });

  if (!response.ok) throw new Error(`서버 오류: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));
      if (data.type === "step") onStep(data.step);
      if (data.type === "result") return data.result;
      if (data.type === "error") throw new Error(data.message);
    }
  }

  return null;
}
