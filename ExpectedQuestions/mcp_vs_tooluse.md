# Q. 이게 진짜 MCP입니까, 아니면 그냥 Tool Use입니까?

## 핵심 답변

"MCP(Model Context Protocol)의 아키텍처 원칙을 따르되, 전송 레이어는 Anthropic Tool Use API 위에서 구현했습니다."

---

## MCP의 핵심 개념 (우리가 지킨 것)

MCP의 본질은 프로토콜(전송 방식)이 아니라 **구조적 분리**입니다.

| MCP 원칙 | 우리 구현 |
|---|---|
| 툴은 description으로 자신을 설명 | ✅ 각 tool의 `description` 필드 |
| Agent가 context 기반으로 툴 선택 | ✅ Claude가 description 읽고 동적 선택 |
| 툴 서버와 클라이언트의 분리 | ✅ `mcpServer.js` 별도 모듈로 분리 |
| 툴은 단일 책임 원칙 | ✅ 각 tool이 하나의 데이터 소스만 담당 |

---

## 진짜 MCP 프로토콜과의 차이

| 항목 | 표준 MCP | 우리 구현 |
|---|---|---|
| 전송 방식 | JSON-RPC over stdio / SSE | Anthropic Tool Use API |
| 서버 프로세스 | 별도 프로세스 실행 | 동일 Node.js 프로세스 내 모듈 |
| 툴 등록 | `@mcp.tool()` 데코레이터 / `server.setRequestHandler` | `MCP_TOOLS` 배열 export |
| 클라이언트 연결 | `StdioClientTransport` / SSE URL | `[...BASE_TOOLS, ...MCP_TOOLS]` 병합 |

---

## 왜 이 방식을 선택했는가

1. **시연 안정성**: 별도 MCP 프로세스 간 통신 장애 없이 데모 가능
2. **핵심 가치 동일**: "Agent가 상황에 따라 도구를 동적으로 선택"하는 평가 기준을 완전히 충족
3. **실용적 설계**: 프로덕션 환경에서도 in-process MCP는 일반적인 패턴

---

## 표준 MCP Server 코드 (참고용 — 이렇게 바꿀 수 있음)

```javascript
// 표준 MCP Server (Node.js)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "lastbus-mcp", version: "1.0.0" });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "weather_alert_tool",
    description: "날씨 특보 조회. 비/눈/폭우 언급 시 호출.",
    inputSchema: {
      type: "object",
      properties: { location: { type: "string" } },
      required: ["location"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "weather_alert_tool") {
    const result = await weatherAlertHandler(req.params.arguments);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
});

await server.connect(new StdioServerTransport());
```

```python
# 표준 MCP Server (Python FastMCP)
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("lastbus-mcp")

@mcp.tool()
def weather_alert_tool(location: str) -> dict:
    """날씨 특보를 조회합니다. 비/눈/폭우 언급 시 호출."""
    return call_weather_api(location)
```

우리 구현은 이 구조를 동일 프로세스 내 모듈로 구현한 것입니다.

---

## 한 줄 요약 (발표 시 사용)

> "MCP의 핵심인 동적 툴 선택과 관심사 분리를 구현했으며, 전송 레이어는 Anthropic Tool Use API를 활용해 안정적인 시연 환경을 구성했습니다."
