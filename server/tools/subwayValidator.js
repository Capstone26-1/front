import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });

function extractJson(text) {
  // 마크다운 코드블록 안의 JSON 추출
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) return blockMatch[1].trim();
  // 중괄호 기반 추출
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text.trim();
}

export async function validateSubwayLeg({ line, fromStation, toStation, departureTime }) {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `당신은 서울 지하철 막차 종착역 전문가입니다. 아래 핵심 사실을 반드시 적용하세요:

[서울 지하철 주요 막차 종착 패턴 — 평일 기준 심야]
- 수도권4호선(안산선/과천선): 인덕원·금정 방면발 막차는 "사당행"으로 사당 종착. 사당 이북(이수·동작·이촌·신용산·삼각지·충무로·혜화·성신여대…) 도달 불가.
- 수도권4호선: 오이도·안산·수원 방면발 막차도 사당 종착 또는 남태령 종착인 경우 많음.
- 수도권2호선: 심야에는 성수지선·신정지선 단축 운행 가능.
- 수도권1호선: 인천·수원·천안 방면 막차는 구로·금천구청 종착인 경우 있음.

주어진 노선·구간·시각을 이 패턴에 대입해 엄격하게 판단하세요.
출발시각이 22:30 이후라면 막차 종착으로 인한 도달 불가 가능성을 반드시 검토하세요.

응답은 반드시 순수 JSON만. 마크다운 코드블록(\`\`\`json) 사용 금지.`,
    messages: [{
      role: "user",
      content: `노선: ${line}\n출발역: ${fromStation}\n목적역: ${toStation}\n출발시각: ${departureTime}\n\n이 시각에 이 열차가 목적역까지 실제로 도달할 수 있는지 판단하세요.\n\n{"feasible":bool,"terminus":"도달 불가 시 실제 종착역명(예:사당역)","reason":"판단 근거 한 줄"}`,
    }],
  });
  try {
    const raw = resp.content[0].text;
    return JSON.parse(extractJson(raw));
  } catch {
    return { feasible: true, terminus: null, reason: "파싱 실패 — 안전하게 통과" };
  }
}
