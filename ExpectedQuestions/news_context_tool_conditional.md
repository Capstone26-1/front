# Q. news_context_tool이 항상 호출되지 않는 이유는?

## 답변

의도적인 설계입니다.

`news_context_tool`은 아래 조건 중 하나를 만족할 때만 호출됩니다:

1. `road_incident_tool`에서 사고·통제가 감지된 경우
2. `search_transit_route` 결과가 비정상(경로 없음·우회)인 경우

경로가 정상이라면 뉴스 조회는 불필요하므로 API 호출을 생략합니다.

## 왜 이렇게 설계했나요?

### 핵심 원칙: 필요한 상황에만 필요한 도구를 쓴다

```
경로 정상 → 뉴스 조회 불필요 → 바로 안전 판정 (API 절약)
경로 이상 → news_context_tool 호출 → 원인 파악 → 추가 도구 선택
```

이것이 MCP 기반 동적 도구 선택의 핵심입니다.
모든 도구를 항상 호출하는 것이 아니라,
상황에 따라 Claude가 필요한 도구만 골라서 사용합니다.

## 검증된 동작

- 강남역 → 사당역 (정상 경로): news_context_tool 미호출 ✅
- 서소문 고가도로 붕괴 언급: road_incident → news_context_tool 자동 트리거 ✅
