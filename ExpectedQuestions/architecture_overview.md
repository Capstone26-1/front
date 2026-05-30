# Q. 전체 시스템 아키텍처를 설명해주세요.

## 아키텍처 다이어그램

```
[사용자]
    │ 자연어 쿼리
    ▼
[React Frontend — localhost:3000]
    │ POST /api/agent (SSE 스트리밍)
    ▼
[Node.js Backend — localhost:3001]
    │
    ├── Express 서버 (index.js)
    │     └── SSE로 워크플로 단계 실시간 전송
    │
    ├── Claude Agent (claude.js)
    │     ├── Anthropic SDK (claude-opus-4-8)
    │     ├── 6개 툴 목록 전달
    │     └── tool_use 응답 처리 루프
    │
    ├── BASE TOOLS (직접 API 호출)
    │     ├── search_location   → Kakao Local API
    │     └── search_transit_route → Tmap 대중교통 API
    │
    └── MCP TOOLS (mcpServer.js)
          ├── weather_alert_tool    → 기상청 API (data.go.kr)
          ├── road_incident_tool    → 국토부 ITS API (openapi.its.go.kr)
          ├── transit_disruption_tool → 서울 지하철 실시간 API
          └── public_event_tool     → Demo Mock
```

---

## 왜 백엔드가 필요한가

| 항목 | 브라우저 직접 호출 | Node.js 백엔드 |
|---|---|---|
| API 키 보안 | ❌ 노출됨 | ✅ 서버에서만 관리 |
| MCP 연동 | ❌ 불가 (프로토콜 미지원) | ✅ 가능 |
| CORS 제한 | ❌ 다수 API 차단 | ✅ 서버 간 호출 |
| SSE 스트리밍 | 제한적 | ✅ 완전 지원 |

---

## 데이터 흐름

1. 사용자가 자연어로 출발지/목적지/시간 입력
2. Backend가 Claude에게 6개 툴 목록과 함께 전달
3. Claude가 툴을 선택해 `tool_use` 응답
4. Backend가 해당 API 실제 호출 후 결과를 Claude에게 반환
5. Claude가 모든 정보를 종합해 위험도 판정
6. `<RESULT>` 태그 안에 JSON 형식으로 최종 출력
7. SSE로 프론트엔드에 단계별 실시간 전송

---

## 사용 기술 스택

| 레이어 | 기술 |
|---|---|
| Frontend | React (CRA), Tailwind CSS |
| Backend | Node.js, Express, ESM |
| AI | Anthropic SDK (claude-opus-4-8) |
| 위치/경로 | Kakao Local API, Tmap 대중교통 API |
| 기상 | 기상청 단기예보 API (data.go.kr) |
| 도로 | 국토부 ITS 돌발상황 API |
| 지하철 | 서울 열린데이터광장 실시간 도착 API |
