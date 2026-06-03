# 막차 위험탐지 AI Agent — 프로젝트 전체 개요

## 프로젝트 소개

친구들과 더 오랜 시간을 함께 보내고 싶은 마음에서 시작한 서비스입니다.
자동차 없이 대중교통을 이용하는 경우, 막차 시간이 다가오면 자리를 떠나야 하는 상황이 반복됩니다.
"지금 출발하면 막차 탈 수 있을까?"라는 불안을 AI Agent가 해소해줍니다.

기존 서비스(네이버 길찾기, 카카오맵)는 경로와 도착 시간만 안내합니다.
이 서비스는 날씨·도로사고·지하철 혼잡·행사 등 복합 위험 요소를 종합 분석해
**가장 위험도가 낮은 방법을 추천**합니다.

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | React (CRA), Tailwind CSS |
| 백엔드 | Node.js, Express, SSE |
| AI | Claude API (claude-opus-4-8), Tool Use |
| 지도/경로 | Kakao 장소 API, Tmap 대중교통 API |
| MCP Tools | 기상청, 국토부 ITS, 서울 지하철, 네이버 뉴스, Mock, 택시 요금 계산(자체 수식) |
| 배포 | Vercel (프론트엔드), Railway (백엔드) |

---

## 아키텍처

```
[브라우저 - mksaveagent2.vercel.app]
  React (src/App.js)
  └─ POST /api/agent (SSE 스트림)
            │
            ▼
[백엔드 - deployment-production-91c7.up.railway.app]
  Express (server/index.js)
  └─ server/claude.js  ← Claude API 호출 + Tool 실행
      ├─ BASE TOOLS (항상 호출)
      │   ├─ search_location       → Kakao 장소 API
      │   └─ search_transit_route  → Tmap 대중교통 API
      │
      └─ MCP TOOLS (동적 선택 — 상황에 따라 자동 결정)
          ├─ weather_alert_tool      → 기상청 단기예보 API
          ├─ road_incident_tool      → 국토부 ITS 돌발상황 API
          ├─ transit_disruption_tool → 서울 열린데이터광장 지하철 API (항상 호출)
          ├─ public_event_tool       → Mock 데이터 (잠실·상암·고척·올림픽공원)
          ├─ news_context_tool       → 네이버 뉴스 검색 API
          └─ taxi_fare_tool          → 자체 수식 (Haversine + 서울 택시 요금표)
```

---

## 동적 Tool 선택 흐름

핵심 평가 기준: **같은 코드, 다른 상황 → 다른 Tool 조합**

```
사용자 자연어 입력
    │
    ▼
search_location × 2      ← 출발지·목적지 좌표 획득
    │
    ▼
search_transit_route     ← 경로 + 소요시간 획득
    │
    ▼
news_context_tool        ← 항상 호출 (경로 주변 교통 이슈 탐지)
    │
    ├─ issues: 날씨       → weather_alert_tool
    ├─ issues: 도로통제   → road_incident_tool
    └─ issues: 행사혼잡  → public_event_tool
    │
    ▼
transit_disruption_tool  ← 항상 호출 (실시간 막차 여부·운행 지연 확인)
    │
    ├─ 정상 운행 ────────────────────── 위험도 판정
    │
    └─ 막차 종료 or (riskScore ≥ 70 + 22시 이후)
         │
         ▼
    taxi_fare_tool       ← 택시 대안 요금 계산
         │
         ▼
    위험도 판정 (riskScore 0~100)
    verdict: 안전 / 주의 / 위험 / 매우 위험
    + 택시 대안 카드 표시 (해당 시)
```

---

## 등록된 API 키 (.env.local)

| 환경변수 | 서비스 |
|---|---|
| `REACT_APP_ANTHROPIC_API_KEY` | Claude API (Anthropic) |
| `REACT_APP_TMAP_API_KEY` | Tmap 대중교통 경로 (SK Open API) |
| `REACT_APP_KAKAO_API_KEY` | Kakao 장소 검색 |
| `WEATHER_API_KEY` | 기상청 단기예보 (공공데이터포털) |
| `SEOUL_METRO_API_KEY` | 서울 지하철 실시간 (서울 열린데이터광장) |
| `ROAD_INCIDENT_API_KEY` | 국토부 ITS 돌발상황 (openapi.its.go.kr) |
| `NAVER_CLIENT_ID` | 네이버 뉴스 검색 API |
| `NAVER_CLIENT_SECRET` | 네이버 뉴스 검색 API |

---

## 발표용 시나리오

| 시나리오 | 쿼리 예시 | 호출되는 Tool |
|---|---|---|
| A. 평상시 | "강남역에서 사당역 막차 탈 수 있어?" | `location`×2 + `route` + `news` + `transit` |
| B. 도로사고 | "서소문 고가도로 붕괴됐다는데 괜찮아?" | + `road_incident` |
| C. 폭우 | "비 오는데 지금 출발해도 막차 가능해?" | + `weather_alert` |
| D. 경기 종료 | "잠실역에서 밤 11시 30분에 출발하면?" | + `public_event` |
| E. 막차 종료 | "돌곶이역에서 대안중학교 새벽 1시 출발" | + `taxi_fare` → 택시 대안 카드 표시 |

시나리오 A는 Tool 4개, B~D는 5개, E는 6개 — 동적 선택이 명확히 보이는 구조입니다.

---

## 프로젝트 파일 구조

```
FE/
├── src/
│   ├── App.js              ← 메인 UI (TaxiCard 포함, 채팅·Hero·Workflow 패널)
│   ├── api/
│   │   ├── agent.js        ← 백엔드 /api/agent SSE 호출
│   │   ├── kakao.js        ← Kakao API (레거시, 현재 미사용)
│   │   └── tmap.js         ← Tmap API (레거시, 현재 미사용)
│   └── index.js
│
├── server/
│   ├── index.js            ← Express 서버 (포트 3001, SSE 엔드포인트, 세션 캐시)
│   ├── claude.js           ← Claude API 호출, Tool 실행, 시스템 프롬프트
│   ├── mcpServer.js        ← MCP Tool 6개 정의 및 핸들러
│   └── tools/
│       ├── kakao.js        ← Kakao 장소 검색
│       └── tmap.js         ← Tmap 대중교통 경로 + 택시 요금 계산(estimateTaxiFare)
│
├── ExpectedQuestions/      ← 발표 예상 질문 md
├── Pendings/               ← 보류 작업
├── Studings/               ← 개인 학습 정리
├── .env.local              ← API 키 8개
└── PROJECT_OVERVIEW.md     ← 이 파일
```

---

## 남은 작업

| 우선순위 | 작업 | 파일 |
|---|---|---|
| 🔴 필수 | 팀원 정보 입력 | `Pendings/team_roles.md` |
| 🟡 권장 | Mock 데이터 제거 (public_event_tool) | `Pendings/remove_mock_data.md` |
| 🟡 권장 | 최적화 (Tmap 정확도, 캐시 TTL 등) | `Pendings/optimization.md` |
| 🟢 선택 | 시나리오 A~E 발표 리허설 | — |

---

## 개발 실행 방법

```bash
# 백엔드 실행
cd server
node index.js
# → http://localhost:3001

# 프론트엔드 실행
npm start
# → http://localhost:3000
```

## 배포 현황

| 서비스 | URL | 브랜치 |
|---|---|---|
| Vercel (프론트) | https://mksaveagent2.vercel.app | Taxi |
| Railway (백엔드) | https://deployment-production-91c7.up.railway.app | Taxi |
| GitHub (코드) | https://github.com/Capstone26-1/mksaveagent | Taxi |
