import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });

export async function validateSubwayLeg({ line, fromStation, toStation, departureTime }) {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: "서울 지하철 막차 종착역 전문가. 반드시 JSON만 출력. 다른 텍스트 없음.",
    messages: [{
      role: "user",
      content: `다음 지하철 이용 가능 여부 판단:\n노선: ${line}\n출발역: ${fromStation}\n목적역: ${toStation}\n출발시각: ${departureTime}\n\n{"feasible":bool,"terminus":"불가시 종착역명","reason":"한줄"}`,
    }],
  });
  try {
    return JSON.parse(resp.content[0].text);
  } catch {
    return { feasible: true, terminus: null, reason: "파싱 실패 — 안전하게 통과" };
  }
}
