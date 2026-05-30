import { searchLocation } from "./kakao";
import { searchTransitRoute } from "./tmap";

const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

const TOOLS = [
  {
    name: "search_location",
    description: "출발지 또는 목적지 장소명으로 위경도 좌표를 검색합니다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색할 장소 이름 (예: 강남역, 홍대입구역)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_transit_route",
    description: "두 지점 사이의 대중교통 경로를 탐색합니다. 막차 여부 판단의 핵심 도구입니다.",
    input_schema: {
      type: "object",
      properties: {
        startX: { type: "string", description: "출발지 경도 (longitude)" },
        startY: { type: "string", description: "출발지 위도 (latitude)" },
        endX: { type: "string", description: "목적지 경도 (longitude)" },
        endY: { type: "string", description: "목적지 위도 (latitude)" },
        time: { type: "string", description: "검색 기준 시간 (YYYYMMDDHHMM). 생략 시 현재 시간." },
      },
      required: ["startX", "startY", "endX", "endY"],
    },
  },
];

function getSystemPrompt() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return `당신은 막차 위험 탐지 AI Agent입니다.

## 현재 시각: ${timeStr}

## 절차
1. 출발지·목적지를 파악합니다
2. search_location으로 두 지점의 좌표를 조회합니다 (병렬 호출 가능)
3. search_transit_route로 현재 시각 기준 대중교통 경로를 조회합니다
4. 경로 없음 → 막차 실패, 있음 → 소요시간·여유시간으로 위험도 계산

## 위험도 기준
- 여유 30분 이상 → 안전 (riskScore 0, verdictTone: emerald, verdict: 안전)
- 여유 10~30분  → 주의 (riskScore 10~30, verdictTone: sky, verdict: 주의)
- 여유 0~10분   → 위험 (riskScore 60~90, verdictTone: rose, verdict: 위험)
- 경로 없음     → 막차 실패 (riskScore 100, verdictTone: rose, verdict: 매우 위험)

## 출력
분석 후 반드시 아래 형식으로 출력하세요:

<RESULT>
{
  "parsed": {
    "origin": "출발지명",
    "destination": "목적지명",
    "situation": "상황 요약",
    "time": "${timeStr}"
  },
  "result": {
    "verdict": "안전|주의|위험|매우 위험",
    "verdictTone": "emerald|sky|rose",
    "riskScore": 0,
    "anomalyType": "정상|막차 위험|막차 실패",
    "confidence": 0.9,
    "headline": "핵심 한 줄 요약",
    "reasons": [
      { "label": "여유 시간", "value": "XX분", "weight": "+0", "tone": "good|warn|bad" }
    ],
    "recommendations": ["권장사항 1", "권장사항 2"],
    "toolsUsed": []
  }
}
</RESULT>`;
}

async function callClaude(messages) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: getSystemPrompt(),
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API 오류 ${res.status}: ${err}`);
  }
  return res.json();
}

async function executeTool(name, input) {
  if (name === "search_location") return await searchLocation(input.query);
  if (name === "search_transit_route") return await searchTransitRoute(input);
  throw new Error(`알 수 없는 tool: ${name}`);
}

function summarizeResult(name, result) {
  if (name === "search_location")
    return `${result.name} (경도 ${Number(result.x).toFixed(4)}, 위도 ${Number(result.y).toFixed(4)})`;
  if (name === "search_transit_route") {
    if (!result.available) return "이용 가능 경로 없음 — 막차 종료";
    return `${result.routes.length}개 경로, 최단 ${result.routes[0].totalTimeMinutes}분 소요`;
  }
  return "";
}

function parseResult(content) {
  const text = (content || []).find((c) => c.type === "text")?.text || "";
  const match = text.match(/<RESULT>([\s\S]*?)<\/RESULT>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

export async function runAgent(userMessage, onStep) {
  const messages = [{ role: "user", content: userMessage }];
  const workflowSteps = [];
  const toolsUsed = [];
  const startTime = Date.now();
  let planCount = 1;
  let criticNg = 0;

  const addStep = (step) => { workflowSteps.push(step); onStep(step); };

  addStep({ kind: "goal", body: userMessage });
  addStep({ kind: "plan", title: "Plan #1", body: "출발지·목적지 좌표 조회 → 대중교통 경로 탐색 → 위험도 계산" });

  for (let i = 0; i < 6; i++) {
    const response = await callClaude(messages);
    const content = response.content || [];
    messages.push({ role: "assistant", content });

    if (response.stop_reason === "end_turn") {
      const parsed = parseResult(content);
      addStep({ kind: "critic", body: "정보 충분, 최종 판정 완료.", decision: "ok" });
      addStep({ kind: "final", body: parsed?.result?.headline || "분석 완료" });
      return {
        parsed: parsed?.parsed,
        result: { ...parsed?.result, toolsUsed },
        workflow: workflowSteps,
        stats: { tools: toolsUsed.length, replans: planCount - 1, criticOk: 1, criticNg, durationMs: Date.now() - startTime },
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolUses = content.filter((c) => c.type === "tool_use");
      const toolResults = [];

      for (const toolUse of toolUses) {
        toolsUsed.push(toolUse.name);
        try {
          const result = await executeTool(toolUse.name, toolUse.input);
          addStep({ kind: "tool", tool: toolUse.name, result: summarizeResult(toolUse.name, result) });
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
        } catch (err) {
          addStep({ kind: "tool", tool: toolUse.name, result: `오류: ${err.message}` });
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Error: ${err.message}`, is_error: true });
          criticNg++;
        }
      }

      messages.push({ role: "user", content: toolResults });

      if (toolResults.some((r) => r.is_error)) {
        addStep({ kind: "critic", body: "tool 오류 발생 — 재계획", decision: "ng", missing: [] });
        planCount++;
        addStep({ kind: "replan", body: "오류 원인 분석 후 재탐색" });
        addStep({ kind: "plan", title: `Plan #${planCount}`, body: "대체 경로 탐색" });
      }
    }
  }

  addStep({ kind: "final", body: "분석 시간 초과" });
  return null;
}
