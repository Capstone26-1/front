# Q. 왜 Claude를 사용했나? GPT-4o 같은 다른 모델은 왜 안 썼나?

## 핵심 답변

3가지 이유로 Claude를 선택했습니다: MCP 네이티브 지원, Tool Use 품질, 추론 능력.

---

## 1. MCP 네이티브 지원

MCP(Model Context Protocol)는 **Anthropic이 직접 설계하고 공개한 표준**입니다.
Claude는 MCP를 가장 먼저, 가장 깊이 지원하는 모델입니다.
GPT-4o도 Function Calling을 지원하지만, MCP 프로토콜 기반 프로젝트에서
Claude를 선택하는 것은 자연스러운 결정이었습니다.

## 2. Tool Use 품질

Claude는 여러 툴을 동시에 언제 호출할지, 어떤 툴을 선택할지에 대한
판단 능력이 뛰어납니다. 특히 툴의 description을 읽고 상황에 맞게
동적으로 선택하는 능력이 이 프로젝트의 핵심 요구사항과 일치했습니다.

## 3. 추론 능력 (Reasoning)

막차 위험도 판단은 단순 검색이 아니라 "여유 시간 계산 → 위험도 분류 →
근거 생성 → 권장사항 도출"의 복합 추론이 필요합니다.
Claude Opus 계열은 이런 다단계 추론에서 높은 신뢰성을 보입니다.

---

## GPT-4o와의 비교

| 항목 | Claude (Anthropic) | GPT-4o (OpenAI) |
|---|---|---|
| MCP 설계 주체 | ✅ Anthropic 직접 설계 | ❌ 별도 지원 없음 |
| Tool Use | ✅ 우수 | ✅ 우수 |
| 긴 context 처리 | ✅ 200K tokens | ✅ 128K tokens |
| 한국어 품질 | ✅ 우수 | ✅ 우수 |
| API 비용 | 다소 높음 | 유사 수준 |

---

## 한 줄 요약

> "MCP를 설계한 주체가 Anthropic이고, 그 철학에 가장 잘 맞는 모델이 Claude이기 때문입니다."
