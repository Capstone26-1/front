# Q. Agent가 어떻게 MCP 툴을 동적으로 선택합니까?

## 핵심 답변

"하드코딩된 if/else가 아니라, Claude가 각 툴의 description을 읽고 현재 상황과 매칭하여 스스로 호출 여부를 결정합니다."

---

## 동작 원리

### 1단계: 툴 목록을 Claude에게 전달

```javascript
const TOOLS = [...BASE_TOOLS, ...MCP_TOOLS];
// 총 6개: search_location, search_transit_route,
//         weather_alert_tool, road_incident_tool,
//         transit_disruption_tool, public_event_tool
```

### 2단계: 시스템 프롬프트로 선택 기준 제시

```
MCP 도구 호출 조건 (상황에 따라 동적 선택):
- weather_alert_tool: 사용자가 비/눈/날씨/폭우를 언급할 때
- road_incident_tool: 경로 탐색 결과가 비정상일 때
- transit_disruption_tool: 지하철 포함 경로 + 22시 이후
- public_event_tool: 잠실·상암·고척 등 경기장 인근 역일 때
```

### 3단계: Claude가 자율 판단

Claude는 툴의 `description`과 사용자 쿼리를 비교해 호출 여부를 결정합니다.
코드에 "날씨 언급 → weather 호출" 같은 하드코딩 없음.

---

## 시나리오별 실제 호출 결과

| 쿼리 | 호출된 툴 |
|---|---|
| "강남역 → 사당역 막차 가능해?" | search_location × 2, search_transit_route |
| "**비 오는데** 막차 탈 수 있어?" | search_location × 2, **weather_alert_tool**, search_transit_route |
| "**잠실**에서 11시 30분에 출발하면?" | search_location × 2, **public_event_tool**, **transit_disruption_tool**, search_transit_route |
| "이 루트 도로 상황 괜찮아?" | search_location × 2, search_transit_route, **road_incident_tool** |

---

## "그럼 항상 모든 툴을 호출하면 되지 않나요?" 에 대한 반박

- 불필요한 API 호출 = 응답 지연 + 비용 낭비
- 관련 없는 정보가 Claude 판단을 오염시킬 수 있음
- 동적 선택이 핵심 — 같은 코드, 다른 상황 → 다른 툴 조합

---

## 한 줄 요약

> "툴의 description이 Claude의 판단 기준이 되며, 코드 수정 없이 쿼리 내용만으로 호출 툴 조합이 달라집니다."
