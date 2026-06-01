# 발표용 시나리오 — Workflow 및 데이터 출처

> 모든 시나리오는 실제 테스트로 검증됨. (2026-06-01)

---

## 시나리오 A — 평상시 (정상 경로)

**쿼리:** `"강남역에서 사당역까지 막차 탈 수 있어?"`

### Workflow
```
1. search_location("강남역")     → 강남역 2호선 (127.0280, 37.4981)
2. search_location("사당역")     → 사당역 2호선 (126.9816, 37.4766)
3. search_transit_route          → 3개 경로, 최단 15분
4. transit_disruption_tool       → 강남역 열차 5편 조회

미호출: road_incident / weather_alert / news_context / public_event
```

### 데이터 출처
| Tool | API | Mock 여부 |
|---|---|---|
| `search_location` | Kakao 장소 검색 API | ❌ 실제 |
| `search_transit_route` | Tmap 대중교통 API | ❌ 실제 |
| `transit_disruption_tool` | 서울 열린데이터광장 지하철 실시간 API | ❌ 실제 |

### 동적 선택 근거
- 경로 정상 → 불필요한 MCP Tool 미호출
- 2호선 포함 경로 감지 → `transit_disruption_tool` 자동 호출

**verdict:** 안전

---

## 시나리오 B — 도로 사고 (news_context_tool 체인)

**쿼리:** `"서소문역에서 사당역까지 막차? 서소문 고가도로 붕괴됐다고. 5월 27일 밤 11시"`

### Workflow
```
1. search_location("서소문역")   → 시청역 1호선 (126.9772, 37.5653)
2. search_location("사당역")     → 사당역 2호선 (126.9816, 37.4766)
3. search_transit_route          → 3개 경로, 최단 30분
4. road_incident_tool            → 도로 정상 (ITS 실시간 — 5일 전 데이터 없음)
5. news_context_tool             → 뉴스 이슈 감지: 도로통제
                                   headlines: "서소문 고가차도 붕괴 당일..."
6. transit_disruption_tool       → 서울역 열차 3편 조회

미호출: weather_alert / public_event
```

### 데이터 출처
| Tool | API | Mock 여부 |
|---|---|---|
| `search_location` | Kakao 장소 검색 API | ❌ 실제 |
| `search_transit_route` | Tmap 대중교통 API | ❌ 실제 |
| `road_incident_tool` | 국토부 ITS API (openapi.its.go.kr) | ❌ 실제 (실시간) |
| `news_context_tool` | 네이버 뉴스 검색 API | ❌ 실제 (실제 기사 감지) |
| `transit_disruption_tool` | 서울 열린데이터광장 | ❌ 실제 |

### 동적 선택 근거
- "고가도로 붕괴됐다고" 언급 → `road_incident_tool` 호출
- road_incident 호출 후 → `news_context_tool` 자동 트리거 (Phase 5 핵심)
- news issues: `['도로통제']` → `transit_disruption_tool` 추가 호출

### 비고
- ITS API는 실시간 전용. 5일 전 사고 데이터는 없으나 네이버 뉴스에 실제 기사 잔존
- 사고가 장기화(철거 진행 중)된 경우 ITS에도 잔류 가능

**verdict:** 위험

---

## 시나리오 C — 폭우

**쿼리:** `"비 오는데 지금 강남역에서 사당역까지 막차 탈 수 있어?"`

### Workflow
```
1. search_location("강남역")     → 강남역 2호선 (127.0280, 37.4981)
2. search_location("사당역")     → 사당역 2호선 (126.9816, 37.4766)
3. search_transit_route          → 3개 경로, 최단 15분
4. weather_alert_tool            → caution: 약한 강수
5. transit_disruption_tool       → 강남역 열차 5편 조회

미호출: road_incident / news_context / public_event
```

### 데이터 출처
| Tool | API | Mock 여부 |
|---|---|---|
| `search_location` | Kakao 장소 검색 API | ❌ 실제 |
| `search_transit_route` | Tmap 대중교통 API | ❌ 실제 |
| `weather_alert_tool` | 기상청 단기예보 API | ❌ 실제 (현재 날씨) |
| `transit_disruption_tool` | 서울 열린데이터광장 | ❌ 실제 |

### 동적 선택 근거
- "비 오는데" 언급 → `weather_alert_tool` 자동 호출
- 경로 정상 → `road_incident_tool` 미호출

### 비고
- 발표 당일 날씨에 따라 `alertLevel` 결과가 달라짐
- 맑은 날에도 `weather_alert_tool`은 호출됨 (동적 선택 자체는 유지)
- 폭우 시 실제 버스 연착 사례: 2025년 12월 4일 수도권 폭설 당시
  홍대입구역→명지대 루트 언덕길 결빙으로 평소 20분→1시간 이상 소요

**verdict:** 안전 (현재 날씨 기준) / 폭우 시 주의·위험

---

## 시나리오 D — 경기 종료 혼잡

**쿼리:** `"잠실역에서 밤 11시 30분에 출발하면 사당역 막차 탈 수 있어?"`

### Workflow
```
1. search_location("잠실역")     → 잠실역 2호선 (127.1002, 37.5133)
2. search_location("사당역")     → 사당역 2호선 (126.9816, 37.4766)
3. search_transit_route          → 3개 경로, 최단 28분
4. public_event_tool             → LG vs KT 야구 경기, 관중 25,000명 (22:30 종료)
5. transit_disruption_tool       → 잠실역 열차 5편 조회

미호출: road_incident / weather_alert / news_context
```

### 데이터 출처
| Tool | API | Mock 여부 |
|---|---|---|
| `search_location` | Kakao 장소 검색 API | ❌ 실제 |
| `search_transit_route` | Tmap 대중교통 API | ❌ 실제 |
| `public_event_tool` | 하드코딩 데이터 | ✅ Mock |
| `transit_disruption_tool` | 서울 열린데이터광장 | ❌ 실제 |

### 동적 선택 근거
- "잠실역" 감지 → `public_event_tool` 자동 호출 (시스템 프롬프트 조건)
- 지하철 포함 + 심야 시간대 → `transit_disruption_tool` 추가 호출

### Mock 상세 (public_event_tool)
```javascript
잠실: {
  eventName: "LG vs KT 야구 경기",
  estimatedCrowd: 25000,
  endTime: "22:30",
  affectedLines: ["2호선"],
}
```
실제 경기 일정 API 미연동. 발표 시연 안정성을 위해 고정값 사용.
실제 서비스라면 네이버 스포츠 API 등으로 교체 가능.

**verdict:** 안전 (경로 정상) / 혼잡 주의

---

## 요약

| 시나리오 | Tool 수 | Mock | 핵심 동적 선택 |
|---|---|---|---|
| A. 평상시 | 4개 | 없음 | `transit` (2호선 감지) |
| B. 도로사고 | 6개 | 없음 | `road` → `news` → `transit` 체인 |
| C. 폭우 | 5개 | 없음 | `weather` ("비" 키워드) |
| D. 경기 종료 | 5개 | `public_event` | `event` ("잠실" 감지) + `transit` |
