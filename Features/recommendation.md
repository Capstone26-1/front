# 기능: 출발 시각 앞당기기 추천

> 브랜치: `Recommendation` | 커밋: `05d20ca`

## 배경 및 문제

`validate_transit_route`가 막차 도달 불가를 감지하면 택시 대안을 제시한다.
그런데 "택시 타세요"만 알려줄 뿐, **몇 시 이전에 출발했으면 지하철로 갈 수 있었는지**는 말해주지 않는다.

사용자 입장에서는 "조금 일찍 출발할 수 있다면 택시 없이 갈 수 있는지"가 중요한 정보다.

## 해결 방식

### 핵심 아이디어
`validateSubwayLeg`에서 이미 haiku를 호출해 막차 종착 여부를 확인한다.
**같은 haiku 호출**에 질문 하나를 추가하면, 추가 API 비용 없이 "안전 출발 마지노선"을 얻을 수 있다.

### 추가된 필드

```javascript
// 기존 응답 스키마
{"feasible": false, "terminus": "사당역", "reason": "..."}

// 수정 후
{"feasible": false, "terminus": "사당역", "reason": "...", "latestSafeDeparture": "23:15"}
```

`latestSafeDeparture`: 이 구간을 지하철로 통과할 수 있는 가장 늦은 출발 시각 (HH:MM).
feasible: true이거나 알 수 없으면 null.

### 데이터 흐름

```
validateSubwayLeg (haiku)
  → latestSafeDeparture: "23:15" 반환

validateTransitRouteHandler
  → results에서 첫 infeasible leg의 latestSafeDeparture 추출

validate_transit_route 결과
  → latestSafeDeparture: "23:15" 포함

Claude 시스템 프롬프트 규칙
  → latestSafeDeparture가 있으면 recommendations에 반드시 포함:
     "HH:MM 이전에 출발하면 지하철만으로 [목적지]까지 도달 가능합니다."
```

## 파일 구조

```
server/tools/subwayValidator.js  ← max_tokens 300→400, latestSafeDeparture 필드 추가
server/mcpServer.js              ← latestSafeDeparture 집계 및 반환
server/claude.js                 ← 시스템 프롬프트: latestSafeDeparture → recommendations 규칙
```

## 테스트 결과

쿼리: "인덕원역에서 돌곶이역 23시 40분에 출발할거야"

```
recommendations:
  [0] "23:10 이전에 출발하면 지하철만으로 돌곶이역까지 도달 가능합니다."
  [1] "사당역까지 지하철 이동 후 택시 환승을 이용하세요."
  [2] "사당역→돌곶이역 택시는 심야 약 23,700원, 약 42분 소요됩니다."
```

두 가지 옵션을 동시에 제공:
- 출발 시각을 앞당길 수 있다면 → 지하철만으로 해결
- 23:40 출발을 고수한다면 → 사당까지 지하철 + 이후 택시
