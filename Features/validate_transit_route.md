# 기능: validate_transit_route — 막차 종착역 자동 검증 + 택시 대안

> 브랜치: `Taxi` | 커밋: `dba6530`, `4184656`, `441e878`

## 배경 및 문제

Tmap 대중교통 API는 스케줄 기반으로 경로를 반환하기 때문에 **막차 종착역을 반영하지 못한다.**

**재현 케이스**: "인덕원역에서 돌곶이역 23:40 출발"
- Tmap이 반환한 경로: 인덕원 →(4호선)→ 삼각지 →(6호선)→ 돌곶이
- 실제 상황: 4호선 막차는 **사당 종착** → 삼각지(사당 이북) 도달 불가
- 기존 시스템은 이를 모르고 `riskScore: 30, verdict: 주의`로 잘못 안내

## 해결 방식

### 핵심 아이디어
Anthropic API가 서울 지하철 막차 지식을 학습 데이터로 보유하고 있다는 점을 활용.
Tmap이 알지 못하는 "막차 종착역"을 Claude에게 물어서 검증한다.

### 구현 흐름

```
search_transit_route (Tmap)
  → SUBWAY leg 있으면
    → validate_transit_route 호출
        → leg마다 validateSubwayLeg() 실행
            → Anthropic API 서브호출 (claude-haiku)
            → 응답: {feasible, terminus, reason}
        → infeasible 발견 시:
            → Kakao API로 종착역 좌표 조회
            → Tmap으로 종착역→최종목적지 재탐색 (altRoute)
  → Claude가 결과 해석 → 택시 대안 안내
```

### 비용 최적화: claude-haiku 선택

| 모델 | 용도 | 이유 |
|---|---|---|
| **claude-opus-4-8** | 메인 에이전트 | 복잡한 다단계 추론 필요 |
| **claude-haiku-4-5** | validateSubwayLeg 서브호출 | 단순 구조화 판단 (feasible/terminus JSON), leg당 반복 호출 → 비용 절감 |

막차 종착역 판단은 "이 노선이 이 시각에 이 역까지 가는가"라는 단순 이진 질문이므로,
sonnet/opus가 아닌 **haiku**로도 충분히 정확하고 빠르게 처리 가능.

### 택시 요금 계산 위치

기존: 출발지 전체 → 목적지 (인덕원→돌곶이, 31.6km, 33,200원)
수정: **마지막 도달 가능 역** → 목적지 (사당역→돌곶이, 21.2km, 23,700원)

Kakao API로 이미 종착역 좌표를 조회하므로, 해당 좌표(`lastReachableX/Y`)를
택시 요금 계산에 재사용. 추가 API 호출 없음.

## 파일 구조

```
server/tools/subwayValidator.js  ← validateSubwayLeg() (haiku 서브호출)
server/mcpServer.js              ← validateTransitRouteHandler(), validate_transit_route MCP 도구
server/claude.js                 ← 시스템 프롬프트: SUBWAY leg 있으면 validate_transit_route 필수 호출
```

## 테스트 결과

쿼리: "인덕원역에서 돌곶이역 23시 40분에 출발할거야"

```
validate_transit_route 결과:
  hasInfeasibleLegs: true
  lastReachableStation: "사당역"
  blockReason: "4호선 막차 사당 종착, 삼각지(이북) 도달 불가"

최종 응답:
  verdict: 매우 위험 (riskScore 95)
  headline: "4호선 막차가 사당 종착이라 삼각지 환승 불가"
  taxiSuggestion: 사당역→돌곶이역 심야 23,700원
```
