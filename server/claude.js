import Anthropic from "@anthropic-ai/sdk";
import { searchLocation } from "./tools/kakao.js";
import { searchTransitRoute } from "./tools/tmap.js";
import { MCP_TOOLS, NEWS_CONTEXT_TOOL, executeMcpTool, summarizeMcpTool } from "./mcpServer.js";

const CACHE_TTL = 5 * 60 * 1000; // 5분

export function createSessionCache() {
  return { location: new Map(), route: new Map(), mcp: new Map() };
}

function routeCacheKey({ startX, startY, endX, endY, time }) {
  const t = time ?? new Date().toLocaleString("sv", { timeZone: "Asia/Seoul" }).replace(/\D/g, "").substring(0, 12);
  return `${startX},${startY},${endX},${endY},${t}`;
}

// 사용자 메시지에서 시각을 추출해 YYYYMMDDHHMM 반환. 없으면 null.
export function extractUserRequestedTime(message) {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  let hour = null, minute = 0;

  if (/자정/.test(message)) { hour = 0; minute = 0; }

  if (hour === null) {
    const m = message.match(/(\d{1,2})시\s*(\d{1,2})분/) ||
              message.match(/(\d{1,2}):(\d{2})/);
    if (m) { hour = parseInt(m[1]); minute = parseInt(m[2]); }
  }
  if (hour === null) {
    const m = message.match(/(\d{1,2})시/);
    if (m) { hour = parseInt(m[1]); minute = 0; }
  }
  if (hour === null || hour > 23) return null;

  // 자정~05:59 → 다음 날
  const base = (hour < 6)
    ? new Date(kstNow.getTime() + 24 * 60 * 60 * 1000)
    : kstNow;
  const dateStr = `${base.getUTCFullYear()}${pad(base.getUTCMonth() + 1)}${pad(base.getUTCDate())}`;
  return `${dateStr}${pad(hour)}${pad(minute)}`;
}

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
  const now = new Date();
  const timeStr = now.toLocaleString("sv", { timeZone: "Asia/Seoul" }).substring(0, 16);

  // YYYYMMDD 형식 오늘/내일 날짜 (KST)
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstTomorrow = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const todayDate = `${kstNow.getUTCFullYear()}${pad(kstNow.getUTCMonth() + 1)}${pad(kstNow.getUTCDate())}`;
  const tomorrowDate = `${kstTomorrow.getUTCFullYear()}${pad(kstTomorrow.getUTCMonth() + 1)}${pad(kstTomorrow.getUTCDate())}`;

  return `당신은 막차 위험 탐지 AI Agent입니다. MCP Tool Server에 연결된 7개의 도구를 상황에 따라 동적으로 선택하여 사용합니다.

## 현재 시각: ${timeStr}
## 오늘 날짜(YYYYMMDD): ${todayDate}
## 내일 날짜(YYYYMMDD): ${tomorrowDate}

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

## 검색 시각 결정 (search_transit_route의 time 파라미터)
사용자 메시지에서 시각을 추출해 YYYYMMDDHHMM 형식으로 변환하고 반드시 time 파라미터로 전달하세요.
- **자정~오전 5시 (00:00~05:59)** → 내일 날짜 사용. 예: "00시 30분" → time: "${tomorrowDate}0030", "새벽 2시" → time: "${tomorrowDate}0200"
- **오전 6시~자정 이전 (06:00~23:59)** → 오늘 날짜 사용. 예: "23시 50분" → time: "${todayDate}2350", "밤 11시" → time: "${todayDate}2300"
- **시각 언급 없음** → time 파라미터 생략 (현재 시각 자동 적용)

## 기본 절차
1. 출발지·목적지를 파악합니다
2. search_location으로 두 지점의 좌표를 조회합니다 (병렬 호출 가능)
3. 위의 **검색 시각 결정** 규칙에 따라 time 파라미터를 설정해 search_transit_route를 호출합니다
4. news_context_tool을 반드시 호출합니다: 출발지·목적지·경로 주요 지명 + "교통 사고 행사 지연" 조합으로 쿼리를 구성하세요 (예: "강남 사당 교통 사고 행사 지연")
5. news_context_tool 결과의 issues 배열에 따라 추가 MCP 도구를 호출합니다
6. 경로 없음 → 막차 실패, 있음 → 소요시간·여유시간 + 뉴스 이슈로 위험도 계산

## MCP 도구 호출 조건
news_context_tool은 항상 호출되며, 결과의 issues 배열에 따라 추가 MCP 도구를 호출합니다:
- issues에 '날씨'      → weather_alert_tool 호출 (사용자가 날씨를 언급한 경우도 포함)
- issues에 '도로통제'  → road_incident_tool 호출 (경로 비정상 시 포함)
- issues에 '행사혼잡'  → public_event_tool 호출 (잠실·상암·고척·올림픽공원 인근도 포함)
- **transit_disruption_tool을 issues와 무관하게 항상 반드시 호출합니다** (출발역 기준). 시간대와 상관없이 매번 막차 여부·실시간 운행 상황을 확인합니다.
- **조회 시각이 22:00 이후이고 경로에 환승이 있는 경우**, search_transit_route 결과의 각 SUBWAY/BUS leg 도착역(toName) 중 최종 목적지가 아닌 환승역마다 transit_disruption_tool을 추가 호출하여 해당 역의 운행 상황과 lastTrainDestination을 확인하세요.

**지하철 경로 막차 검증 (필수)**
- search_transit_route 결과에 SUBWAY leg가 1개 이상 포함된 경우, 반드시 validate_transit_route를 바로 이어서 호출하세요.
  → legs: 해당 경로의 legs 배열 전체 (첫 번째 경로 기준)
  → departureTime: 사용자가 요청한 출발 시각 (HH:MM 형식, 예: "23:40")
  → endX/endY: 최종 목적지 좌표 (search_location으로 조회한 값)
  → finalDestination: 최종 목적지 역명

**validate_transit_route 결과 해석**
- hasInfeasibleLegs: false → 경로 정상. 기존 흐름대로 진행.
- hasInfeasibleLegs: true →
  1. blockReason을 사용자에게 설명 (예: "4호선 막차가 사당 종착으로 삼각지에 도달할 수 없습니다")
  2. altRoute가 있으면: lastReachableStation까지 기존 경로 + 이후 altRoute 조합으로 안내
  3. taxi_fare_tool을 lastReachableX/lastReachableY(startX/Y) → endX/endY로 호출해 택시 대안 제시. startName: lastReachableStation, endName: finalDestination
  4. riskScore: 90 이상 설정

## 위험도 기준
- 여유 30분 이상 → 안전 (riskScore 0, verdictTone: emerald, verdict: 안전)
- 여유 10~30분  → 주의 (riskScore 10~30, verdictTone: sky, verdict: 주의)
- 여유 0~10분   → 위험 (riskScore 60~90, verdictTone: rose, verdict: 위험)
- 경로 없음     → 막차 실패 (riskScore 100, verdictTone: rose, verdict: 매우 위험)
- news_context_tool issues 감지 시 이슈 1개당 riskScore +10 상향 조정하세요
- 추가 MCP 도구에서 위험 요소 감지 시 riskScore를 추가 상향 조정하세요

## riskScore 일관성 원칙
riskScore는 **경로 조회 결과(search_transit_route)와 도구 결과**만을 기준으로 산출합니다.
- 사용자가 "마지노선", "최대한 늦게", "아슬아슬", "몇 시까지 출발?" 등 어떤 표현을 써도 riskScore 계산 방식은 동일합니다
- 동일한 출발 시각·경로 결과라면 질문 표현과 무관하게 동일한 riskScore를 적용하세요
- 미래 가정("만약 더 늦으면")은 riskScore에 반영하지 마세요. 실제 조회된 시각 기준으로만 판단하세요

## transit_disruption_tool 결과 해석
- apiError: true → API 조회 실패 (해당 노선 미지원 등). trains 배열 비어있어도 막차 종료로 단정하지 마세요. 대신 search_transit_route의 경로 출발 시각 기준으로만 위험도를 판단하세요.
- trains 배열이 비어있음 + apiError 없음 → 해당 역 막차 종료. riskScore 100, verdict: 매우 위험, "막차가 이미 끊겼습니다. 지금 당장 출발하거나 대체 교통수단을 이용하세요."
- isLastTrain: true 포함 → 지금이 막차. riskScore 최소 70 이상, verdict: 위험, "현재 운행 중인 열차가 막차입니다. 즉시 출발하세요."
- hasDisruption: true → 운행 지연. riskScore +30 추가
- congestionLevel: crowded/very_crowded → riskScore +10 추가
- **환승역 검증 시 lastTrainDestination 활용**: 출발역의 lastTrainDestination이 있으면 해당 막차가 다음 환승역까지 도달 가능한지 서울 지하철 노선 지식으로 판단하세요. 예) 인덕원역 lastTrainDestination: "사당" → 사당 이북 역(동작·이촌·삼각지·효창공원앞…) 도달 불가
- **환승역 trains: [] + apiError 없음** → 해당 환승역 운행 종료. riskScore 100, 매우 위험. "N호선 막차가 [환승역] 이전에서 종착하여 환승이 불가합니다." 메시지 사용. taxi_fare_tool을 마지막 도달 가능 역 → 목적지로 호출하세요.

## 택시 대안 (taxi_fare_tool)
다음 두 조건 중 하나라도 해당하면 taxi_fare_tool을 반드시 호출하세요:
1. **search_transit_route가 available: false를 반환한 경우** → 출발지 좌표(startX/Y)와 목적지 좌표(endX/Y)로 호출
2. **경로는 있으나 riskScore ≥ 70이고 조회 시각이 22:00 이후인 경우** → 경로 legs 중 마지막 SUBWAY 또는 BUS leg의 도착역(toName)을 startName으로, 해당 역 좌표를 startX/Y로, 목적지를 endName/endX/Y로 호출

taxi_fare_tool 호출 후 결과를 taxiSuggestion으로 출력에 포함하세요.

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
    "toolsUsed": [],
    "taxiSuggestion": {
      "available": false
    }
  }
}
</RESULT>

택시 대안이 필요한 경우 taxiSuggestion:
{
  "available": true,
  "fromName": "마지막 탑승 가능 역명 또는 출발지명",
  "toName": "목적지명",
  "estimatedFare": 15000,
  "estimatedFareNight": 18000,
  "distanceKm": 8.5,
  "durationMinutes": 25,
  "reason": "택시가 필요한 이유 한 줄"
}`;
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
    if (!result.available) return `이용 가능 경로 없음 — 막차 종료 (조회시각: ${result.queryTime})`;
    return `${result.routes.length}개 경로, 최단 ${result.routes[0].totalTimeMinutes}분 소요 (조회시각: ${result.queryTime})`;
  }
  return summarizeMcpTool(name, result);
}

async function executeToolCached(name, input, cache, userRequestedTime) {
  if (name === "search_location") {
    const key = input.query.trim().toLowerCase();
    if (cache.location.has(key)) return cache.location.get(key);
    const result = await searchLocation(input.query);
    cache.location.set(key, result);
    return result;
  }
  if (name === "search_transit_route") {
    // Claude가 time을 누락했을 경우 사용자가 지정한 시각으로 자동 주입
    if (!input.time && userRequestedTime) input = { ...input, time: userRequestedTime };
    const key = routeCacheKey(input);
    const hit = cache.route.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.result;
    const result = await searchTransitRoute(input);
    cache.route.set(key, { result, ts: Date.now() });
    return result;
  }
  const key = `${name}:${JSON.stringify(input)}`;
  const hit = cache.mcp.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.result;
  const result = await executeMcpTool(name, input);
  cache.mcp.set(key, { result, ts: Date.now() });
  return result;
}

export async function runAgent(userMessage, history = [], onStep, sessionCache = null) {
  const cache = sessionCache ?? createSessionCache();
  const userRequestedTime = extractUserRequestedTime(userMessage);
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
          const result = await executeToolCached(toolUse.name, toolUse.input, cache, userRequestedTime);
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
