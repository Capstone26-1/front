import Anthropic from "@anthropic-ai/sdk";
import { searchLocation } from "./tools/kakao.js";
import { searchTransitRoute } from "./tools/tmap.js";
import { MCP_TOOLS, NEWS_CONTEXT_TOOL, executeMcpTool, summarizeMcpTool } from "./mcpServer.js";

let _client;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
  return _client;
}

const BASE_TOOLS = [
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
  NEWS_CONTEXT_TOOL,
];

const TOOLS = [...BASE_TOOLS, ...MCP_TOOLS];

function getSystemPrompt() {
  // sv 로케일은 "YYYY-MM-DD HH:MM:SS" 형식 → KST 기준으로 직접 포맷
  const timeStr = new Date().toLocaleString("sv", { timeZone: "Asia/Seoul" }).substring(0, 16);

  return `당신은 막차 위험 탐지 AI Agent입니다. MCP Tool Server에 연결된 7개의 도구를 상황에 따라 동적으로 선택하여 사용합니다.

## 현재 시각: ${timeStr}

## 대화 맥락 활용
이전 대화 내용이 함께 제공됩니다. 사용자가 출발지·목적지를 앞선 메시지에서 이미 알려줬다면 다시 묻지 말고 그 정보를 그대로 활용하세요. "거기서", "방금 그 경로", "그럼 30분 뒤엔?" 같은 후속 질문은 직전 맥락을 기준으로 해석하세요.

## 대화형 처리 (도구 호출 없이 즉시 응답)

다음 두 경우는 도구 호출 없이 아래 형식으로 즉시 응답하세요.

**① 출발지 또는 목적지가 불분명한 경우** — 부드럽게 되물어보세요.
예: "어디서 어디까지 가실 예정인가요? 출발지와 목적지를 알려주시면 바로 막차 분석해드릴게요!"

**② 막차·이동과 무관한 일상 질문인 경우** — 짧게 받아주고 막차 분석으로 자연스럽게 유도하세요.
예: "저는 막차 전문이라 날씨는 잘 모르지만, 혹시 오늘 밤 이동 계획 있으시면 막차 안전하게 탈 수 있는지 알려드릴게요 😊"

<RESULT>
{
  "parsed": { "origin": null, "destination": null, "situation": "대화", "time": "${timeStr}" },
  "result": {
    "verdict": "대화",
    "verdictTone": "sky",
    "riskScore": 0,
    "anomalyType": "정상",
    "confidence": 1.0,
    "headline": "여기에 실제 응답 문장을 작성하세요",
    "reasons": [],
    "recommendations": [],
    "toolsUsed": []
  }
}
</RESULT>

## 기본 절차
1. 출발지·목적지를 파악합니다
2. search_location으로 두 지점의 좌표를 조회합니다 (병렬 호출 가능)
3. search_transit_route로 현재 시각 기준 대중교통 경로를 조회합니다
4. news_context_tool을 반드시 호출합니다: 출발지·목적지·경로 주요 지명 + "교통 사고 행사 지연" 조합으로 쿼리를 구성하세요 (예: "강남 사당 교통 사고 행사 지연")
5. news_context_tool 결과의 issues 배열에 따라 추가 MCP 도구를 호출합니다
6. 경로 없음 → 막차 실패, 있음 → 소요시간·여유시간 + 뉴스 이슈로 위험도 계산

## MCP 도구 호출 조건
news_context_tool은 항상 호출되며, 결과의 issues 배열에 따라 추가 MCP 도구를 호출합니다:
- issues에 '날씨'      → weather_alert_tool 호출 (사용자가 날씨를 언급한 경우도 포함)
- issues에 '도로통제'  → road_incident_tool 호출 (경로 비정상 시 포함)
- issues에 '행사혼잡'  → public_event_tool 호출 (잠실·상암·고척·올림픽공원 인근도 포함)
- **현재 시각이 22:00 이후이면 issues와 무관하게 transit_disruption_tool을 반드시 호출합니다** (출발역 또는 환승역 기준)

## 위험도 기준
- 여유 30분 이상 → 안전 (riskScore 0, verdictTone: emerald, verdict: 안전)
- 여유 10~30분  → 주의 (riskScore 10~30, verdictTone: sky, verdict: 주의)
- 여유 0~10분   → 위험 (riskScore 60~90, verdictTone: rose, verdict: 위험)
- 경로 없음     → 막차 실패 (riskScore 100, verdictTone: rose, verdict: 매우 위험)
- news_context_tool issues 감지 시 이슈 1개당 riskScore +10 상향 조정하세요
- 추가 MCP 도구에서 위험 요소 감지 시 riskScore를 추가 상향 조정하세요

## transit_disruption_tool 결과 해석 (22시 이후 필수 적용)
- trains 배열이 비어있음 → 해당 역 막차 종료. riskScore 100, verdict: 매우 위험, "막차가 이미 끊겼습니다. 지금 당장 출발하거나 대체 교통수단을 이용하세요."
- isLastTrain: true 포함 → 지금이 막차. riskScore 최소 70 이상, verdict: 위험, "현재 운행 중인 열차가 막차입니다. 즉시 출발하세요."
- hasDisruption: true → 운행 지연. riskScore +30 추가
- congestionLevel: crowded/very_crowded → riskScore +10 추가

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

function parseResult(content) {
  const text = (content || []).find((c) => c.type === "text")?.text || "";
  const match = text.match(/<RESULT>([\s\S]*?)<\/RESULT>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function summarizeResult(name, result) {
  if (name === "search_location")
    return `${result.name} (경도 ${Number(result.x).toFixed(4)}, 위도 ${Number(result.y).toFixed(4)})`;
  if (name === "search_transit_route") {
    if (!result.available) return "이용 가능 경로 없음 — 막차 종료";
    return `${result.routes.length}개 경로, 최단 ${result.routes[0].totalTimeMinutes}분 소요`;
  }
  return summarizeMcpTool(name, result);
}

async function executeTool(name, input) {
  if (name === "search_location") return await searchLocation(input.query);
  if (name === "search_transit_route") return await searchTransitRoute(input);
  return await executeMcpTool(name, input);
}

export async function runAgent(userMessage, history = [], onStep) {
  // 이전 대화 맥락(history)을 messages 앞에 붙여 같은 세션 내 연속성을 유지한다.
  const messages = [...history, { role: "user", content: userMessage }];
  const workflowSteps = [];
  const toolsUsed = [];
  const startTime = Date.now();
  let planCount = 1;
  let criticNg = 0;
  let routeData = null; // 마지막으로 조회된 대중교통 경로(요금·구간 포함)

  const addStep = (step) => {
    workflowSteps.push(step);
    onStep(step);
  };

  addStep({ kind: "goal", body: userMessage });
  addStep({ kind: "plan", title: "Plan #1", body: "출발지·목적지 좌표 조회 → 대중교통 경로 탐색 → 위험도 계산" });

  for (let i = 0; i < 6; i++) {
    const response = await getClient().messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: getSystemPrompt(),
      tools: TOOLS,
      messages,
    });

    const content = response.content || [];
    messages.push({ role: "assistant", content });

    if (response.stop_reason === "end_turn") {
      const parsed = parseResult(content);
      addStep({ kind: "critic", body: "정보 충분, 최종 판정 완료.", decision: "ok" });
      addStep({ kind: "final", body: parsed?.result?.headline || "분석 완료" });
      return {
        parsed: parsed?.parsed,
        result: { ...parsed?.result, toolsUsed, routes: routeData?.routes || null },
        workflow: workflowSteps,
        stats: {
          tools: toolsUsed.length,
          replans: planCount - 1,
          criticOk: 1,
          criticNg,
          durationMs: Date.now() - startTime,
        },
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolUses = content.filter((c) => c.type === "tool_use");
      const toolResults = [];

      for (const toolUse of toolUses) {
        toolsUsed.push(toolUse.name);
        try {
          const result = await executeTool(toolUse.name, toolUse.input);
          if (toolUse.name === "search_transit_route" && result.available) {
            routeData = result; // 추천 경로/요금 카드용으로 보관
          }
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
