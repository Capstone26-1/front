// 막차 실패 위험 이상탐지 — Claude Agent + Tmap + Kakao

import React, { useEffect, useMemo, useRef, useState } from "react";
import { runAgent } from "./api/agent";

const TOOL_REGISTRY = [
  { name: "search_location",         desc: "장소명 → 위경도 좌표 (Kakao)" },
  { name: "search_transit_route",    desc: "대중교통 경로 탐색 (Tmap)" },
  { name: "weather_alert_tool",      desc: "기상 특보 · 강수 위험도 (기상청)" },
  { name: "road_incident_tool",      desc: "도로 돌발상황 · 통제 (국토부 ITS)" },
  { name: "transit_disruption_tool", desc: "지하철 실시간 지연 · 혼잡 (서울)" },
  { name: "public_event_tool",       desc: "대형 행사 혼잡 · 관중 (Demo)" },
  { name: "news_context_tool",       desc: "교통 이슈 원인 뉴스 검색 (네이버)" },
];

const SUGGESTIONS = [
  { query: "지금 강남역에서 사당역까지 막차 탈 수 있어?" },
  { query: "버스가 20분째 안 오는데 막차 놓치는 거 아니야?" },
  { query: "비 오는데 지금 출발해도 막차 가능해?" },
];

// ───────────────────── 헤더 ─────────────────────

function Header({ onToggleWorkflow, workflowOpen, hasMessages, onReset }) {
  return (
    <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
        <button onClick={onReset} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/90 group-hover:bg-indigo-400 flex items-center justify-center text-white font-bold transition">
            막
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-100">막차 위험탐지 Agent</div>
            <div className="text-xs text-slate-500">Claude · Tmap · Kakao</div>
          </div>
        </button>

        {hasMessages && (
          <div className="ml-auto">
            <button
              onClick={onToggleWorkflow}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition border " +
                (workflowOpen
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800")
              }
              title="Dynamic Workflow 분석 패널 토글"
            >
              <span className="text-base leading-none">⏿</span>
              Workflow
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ───────────────────── Hero (빈 상태) ─────────────────────

function Hero({ onSend, onSuggestion }) {
  const [text, setText] = useState("");

  return (
    <div className="max-w-3xl mx-auto px-6 pt-20">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          MCP Tool Server 7개 연결됨
        </div>
        <h1 className="mt-6 text-4xl font-semibold text-slate-100 tracking-tight">
          오늘 막차, 안전하게 탈 수 있을까요?
        </h1>
        <p className="mt-3 text-slate-400">
          출발지·목적지·지금 상황을 자유롭게 적어주세요. Agent가 알아서 필요한 정보를 골라 분석합니다.
        </p>
      </div>

      <div className="mt-10">
        <Composer text={text} setText={setText} onSend={() => text.trim() && onSend(text)} large />
      </div>

      <div className="mt-6">
        <div className="text-xs text-slate-500 mb-3">이런 질문을 해보세요</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(s)}
              className="text-left px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/60 transition"
            >
              <div className="text-sm text-slate-200 leading-relaxed">{s.query}</div>

            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────── Composer (입력창) ─────────────────────

function Composer({ text, setText, onSend, large = false, disabled = false }) {
  const ref = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  };

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [text]);

  return (
    <div
      className={
        "flex items-end gap-2 p-3 rounded-2xl border bg-slate-900/80 transition " +
        (disabled ? "border-slate-800 opacity-60" : "border-slate-700 focus-within:border-indigo-500/60")
      }
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={large ? "예: 강남역에서 사당역까지 막차 탈 수 있어?" : "추가 질문을 입력하세요..."}
        rows={1}
        disabled={disabled}
        className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 resize-none outline-none px-2 py-2 max-h-40"
      />
      <button
        onClick={onSend}
        disabled={disabled || !text.trim()}
        className={
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition " +
          (disabled || !text.trim()
            ? "bg-slate-800 text-slate-600 cursor-not-allowed"
            : "bg-indigo-500 hover:bg-indigo-400 text-white")
        }
        aria-label="보내기"
      >
        <SendIcon />
      </button>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

// ───────────────────── 채팅 메시지들 ─────────────────────

function ChatList({ messages, isLoading, liveWorkflow, onOpenWorkflow, scrollRef }) {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-8 pb-40 space-y-6">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserMessage key={i} text={m.content} />
        ) : (
          <AssistantMessage key={i} data={m} onOpenWorkflow={onOpenWorkflow} />
        )
      )}
      {isLoading && <LoadingMessage steps={liveWorkflow} />}
      <div ref={scrollRef} />
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-indigo-500 text-white text-sm leading-relaxed shadow-sm">
        {text}
      </div>
    </div>
  );
}

const STEP_CONFIG = {
  goal:   { icon: "◎", color: "text-indigo-400",  label: (s) => "Goal" },
  plan:   { icon: "◈", color: "text-blue-400",    label: (s) => s.title || "Plan" },
  tool:   { icon: "⚙", color: "text-slate-400",   label: (s) => s.tool },
  critic: { icon: "✓", color: "text-emerald-400", label: (s) => s.decision === "ok" ? "Critic ✓" : "Critic ⚠" },
  replan: { icon: "↻", color: "text-orange-400",  label: (s) => "Re-plan" },
  final:  { icon: "★", color: "text-indigo-400",  label: (s) => "Final" },
};

function LiveStep({ step }) {
  const cfg = STEP_CONFIG[step.kind] || { icon: "•", color: "text-slate-400", label: () => step.kind };
  return (
    <div className="flex items-start gap-2 text-xs text-slate-400 py-0.5">
      <span className={cfg.color + " font-mono shrink-0 mt-0.5"}>{cfg.icon}</span>
      <div className="min-w-0">
        <span className="font-medium text-slate-300">{cfg.label(step)}</span>
        {step.body && <span className="ml-1 text-slate-500 truncate">{step.body}</span>}
        {step.result && <span className="ml-1 text-slate-600">→ {step.result}</span>}
      </div>
    </div>
  );
}

function LoadingMessage({ steps = [] }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => <LiveStep key={i} step={step} />)}
      <div className="flex items-center gap-3 text-slate-400 text-sm pt-1">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "240ms" }} />
        </div>
        <span>Agent가 Tool들을 호출하는 중...</span>
      </div>
    </div>
  );
}

function ChatBubbleMessage({ r }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-500/90 flex items-center justify-center text-white font-bold text-sm">
        막
      </div>
      <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-md bg-slate-800 text-slate-100 text-sm leading-relaxed">
        {r.headline}
      </div>
    </div>
  );
}

// 메인 어시스턴트 응답 카드: Goal Manager + 결과 카드 + 점수 분해 + 추천 + Tools + Workflow 버튼
function AssistantMessage({ data, onOpenWorkflow }) {
  const r = data.result;
  const parsed = data.parsed;

  if (r?.verdict === "대화") return <ChatBubbleMessage r={r} />;

  const verdictToneMap = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    sky: "bg-sky-500/10 border-sky-500/30 text-sky-300",
    rose: "bg-rose-500/10 border-rose-500/30 text-rose-300",
  };
  const scoreColorMap = {
    emerald: "text-emerald-400",
    sky: "text-sky-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  const scoreTone =
    r.riskScore >= 60 ? "rose" : r.riskScore >= 30 ? "amber" : r.riskScore > 0 ? "sky" : "emerald";

  return (
    <div className="space-y-3">
      {/* Goal Manager 파싱 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-indigo-400">◎</span>
          <span className="font-semibold text-slate-300">요청 파싱</span>
          <span className="text-slate-600">(Goal Manager)</span>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <ParsedField label="출발지" value={parsed?.origin} />
          <ParsedField label="목적지" value={parsed?.destination} />
          <ParsedField label="시각" value={parsed?.time} />
          <ParsedField label="상황" value={parsed?.situation} highlight />
        </div>
      </div>

      {/* 헤드라인 카드 */}
      <div className={"rounded-xl border p-5 flex items-center gap-5 " + verdictToneMap[r.verdictTone]}>
        <div className={"text-5xl font-bold leading-none " + scoreColorMap[scoreTone]}>{r.riskScore}</div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider opacity-70">현재 판정</div>
          <div className="text-xl font-semibold mt-0.5 text-slate-100">{r.verdict}</div>
          <div className="text-xs mt-1 opacity-90">
            <span className="font-medium">Anomaly Type:</span> {r.anomalyType}
          </div>
          <p className="text-sm mt-2 text-slate-200">{r.headline}</p>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">신뢰도</div>
          <div className="text-lg font-semibold text-slate-100">{(r.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* 추천 경로 & 요금 */}
      <RouteCard routes={r.routes} />

      {/* 점수 분해 + 추천 행동 (2단) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="왜 위험한가" subtitle="slack = 막차까지 − 도착 예정 − 환승 도보">
          <ul className="space-y-2.5">
            {r.reasons.map((row, i) => (
              <li key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">{row.label}</div>
                  <div className="text-xs text-slate-500">{row.value}</div>
                </div>
                <ScoreChip weight={row.weight} tone={row.tone} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="추천 행동">
          <ul className="space-y-2.5">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                <div
                  className={
                    "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold " +
                    (i === 0 ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400")
                  }
                >
                  {i + 1}
                </div>
                <div>{rec}</div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* 사용된 Tools + Workflow 버튼 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="text-xs text-slate-500">사용된 MCP Tool {r.toolsUsed.length}개</div>
        <div className="flex flex-wrap gap-1.5">
          {r.toolsUsed.map((t, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={onOpenWorkflow}
          className="ml-auto text-xs text-indigo-300 hover:text-indigo-200 font-medium"
        >
          Workflow 분석 →
        </button>
      </div>
    </div>
  );
}

function ParsedField({ label, value, highlight }) {
  return (
    <div
      className={
        "rounded-md border px-2.5 py-1.5 " +
        (highlight ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/60")
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-xs mt-0.5 " + (highlight ? "text-indigo-200" : "text-slate-300")}>{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ScoreChip({ weight, tone }) {
  const toneMap = {
    good: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-amber-500/15 text-amber-300",
    bad: "bg-rose-500/15 text-rose-300",
  };
  return <span className={"px-2.5 py-1 rounded-md text-sm font-mono " + toneMap[tone]}>{weight}점</span>;
}

// ───────────────────── 추천 경로 & 요금 ─────────────────────

const MODE_STYLE = {
  WALK:       { icon: "🚶", label: "도보",   cls: "bg-slate-700/50 text-slate-300" },
  BUS:        { icon: "🚌", label: "버스",   cls: "bg-emerald-500/20 text-emerald-300" },
  SUBWAY:     { icon: "🚇", label: "지하철", cls: "bg-indigo-500/20 text-indigo-300" },
  TRAIN:      { icon: "🚆", label: "기차",   cls: "bg-blue-500/20 text-blue-300" },
  EXPRESSBUS: { icon: "🚍", label: "고속버스", cls: "bg-amber-500/20 text-amber-300" },
  AIRPLANE:   { icon: "✈️", label: "항공",   cls: "bg-sky-500/20 text-sky-300" },
};

function modeStyle(mode) {
  return MODE_STYLE[mode] || { icon: "•", label: mode || "이동", cls: "bg-slate-700/50 text-slate-300" };
}

function formatFare(fare) {
  if (fare == null || fare === 0) return "요금 정보 없음";
  return `${Number(fare).toLocaleString()}원`;
}

function RouteCard({ routes }) {
  if (!routes || routes.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-indigo-400">🧭</span>
        <span className="text-sm font-semibold text-slate-200">추천 경로 & 요금</span>
        <span className="text-xs text-slate-500">Tmap 대중교통</span>
      </div>

      <div className="mt-3 space-y-2.5">
        {routes.map((route, i) => (
          <RouteRow key={i} route={route} recommended={i === 0} />
        ))}
      </div>
    </div>
  );
}

function RouteRow({ route, recommended }) {
  const legs = (route.legs || []).filter((l) => l.mode !== "WALK" || (l.durationMinutes || 0) >= 2);

  return (
    <div
      className={
        "rounded-lg border px-3 py-2.5 " +
        (recommended
          ? "border-indigo-500/40 bg-indigo-500/10"
          : "border-slate-800 bg-slate-950/40")
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        {recommended ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/30 text-indigo-200">
            추천
          </span>
        ) : (
          <span className="text-xs text-slate-500">경로 {route.rank}</span>
        )}
        <span className="text-sm font-semibold text-slate-100">{route.totalTimeMinutes}분</span>
        <span className="text-xs text-slate-500">환승 {route.transferCount}회</span>
        <span className="ml-auto text-sm font-semibold text-emerald-300">{formatFare(route.totalFare)}</span>
      </div>

      <div className="mt-2 flex items-center gap-1 flex-wrap">
        {legs.map((leg, i) => {
          const s = modeStyle(leg.mode);
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-slate-600 text-xs">›</span>}
              <span
                className={"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs " + s.cls}
                title={leg.fromName && leg.toName ? `${leg.fromName} → ${leg.toName}` : undefined}
              >
                <span>{s.icon}</span>
                <span className="font-medium">{leg.routeName || s.label}</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────── Workflow 슬라이드 패널 ─────────────────────

function WorkflowPanel({ data, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 animate-fadeIn"
      />
      <aside
        className="fixed top-0 right-0 h-full w-full md:w-[720px] bg-slate-950 border-l border-slate-800 z-40 overflow-y-auto animate-slideIn"
      >
        <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Dynamic Workflow</div>
            <div className="text-xs text-slate-500">Agent가 직접 만든 실행 경로</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition flex items-center justify-center"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <WorkflowStats stats={data.stats} />
          <Timeline steps={data.workflow} />
          <ToolRegistryList usedTools={data.result.toolsUsed} />
        </div>
      </aside>
    </>
  );
}

function WorkflowStats({ stats }) {
  const items = [
    { label: "Tool 호출", value: stats.tools },
    { label: "Re-plan", value: stats.replans, highlight: stats.replans > 0 },
    { label: "Critic OK", value: stats.criticOk },
    { label: "Critic NG", value: stats.criticNg, highlight: stats.criticNg > 0 },
    { label: "실행 시간", value: (stats.durationMs / 1000).toFixed(2) + "s" },
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className={
            "rounded-md border px-3 py-2 " +
            (it.highlight ? "border-orange-500/40 bg-orange-500/10" : "border-slate-800 bg-slate-900/60")
          }
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{it.label}</div>
          <div className={"text-lg font-semibold mt-0.5 " + (it.highlight ? "text-orange-300" : "text-slate-100")}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ steps }) {
  return (
    <ol className="mt-6 relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-800" />
      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <TimelineNode key={i} step={step} index={i} />
        ))}
      </div>
    </ol>
  );
}

function TimelineNode({ step, index }) {
  const kindMap = {
    goal: {
      dot: "bg-indigo-500",
      title: "Goal",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/10",
      titleColor: "text-indigo-200",
    },
    plan: {
      dot: "bg-blue-500",
      title: step.title || "Plan",
      border: "border-blue-500/30",
      bg: "bg-blue-500/10",
      titleColor: "text-blue-200",
    },
    tool: {
      dot: "bg-slate-500",
      title: step.tool,
      border: "border-slate-700",
      bg: "bg-slate-900/60",
      titleColor: "text-slate-200",
    },
    critic: {
      dot: step.decision === "ok" ? "bg-emerald-500" : "bg-amber-500",
      title: step.decision === "ok" ? "Critic ✓ 정보 충분" : "Critic ⚠ 정보 부족",
      border: step.decision === "ok" ? "border-emerald-500/30" : "border-amber-500/40",
      bg: step.decision === "ok" ? "bg-emerald-500/10" : "bg-amber-500/10",
      titleColor: step.decision === "ok" ? "text-emerald-200" : "text-amber-200",
    },
    replan: {
      dot: "bg-orange-500",
      title: "↻ Re-planner",
      border: "border-orange-500/50",
      bg: "bg-orange-500/15",
      titleColor: "text-orange-200",
    },
    final: {
      dot: "bg-indigo-500",
      title: "Final Answer",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/10",
      titleColor: "text-indigo-200",
    },
  };
  const cfg = kindMap[step.kind];

  return (
    <li className="relative pl-10">
      <div className={"absolute left-[9px] top-2 w-3.5 h-3.5 rounded-full border-2 border-slate-950 " + cfg.dot} />
      <div className={"rounded-md border px-3 py-2 " + cfg.border + " " + cfg.bg}>
        <div className="flex items-center justify-between">
          <div className={"text-sm font-semibold " + cfg.titleColor}>
            {step.kind === "tool" ? <span className="font-mono text-xs">{cfg.title}</span> : cfg.title}
          </div>
          <div className="text-xs text-slate-500">#{index + 1}</div>
        </div>
        {step.body && <div className="text-sm text-slate-300 mt-0.5">{step.body}</div>}
        {step.result && <div className="text-xs text-slate-500 mt-1">→ {step.result}</div>}
        {step.missing && (
          <div className="mt-1 flex flex-wrap gap-1">
            {step.missing.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-200 font-mono"
              >
                missing: {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function ToolRegistryList({ usedTools }) {
  return (
    <div className="mt-8">
      <div className="text-sm font-semibold text-slate-200">Tool Registry</div>
      <p className="text-xs text-slate-500 mt-0.5">
        Planner Agent가 매번 이 카탈로그에서 다음 Tool을 선택합니다.
      </p>
      <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {TOOL_REGISTRY.map((t) => {
          const used = usedTools.includes(t.name);
          return (
            <li
              key={t.name}
              className={
                "px-3 py-2 rounded-md border text-sm " +
                (used
                  ? "border-indigo-500/40 bg-indigo-500/10"
                  : "border-slate-800 bg-slate-900/40")
              }
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs text-slate-200">{t.name}</div>
                {used ? (
                  <span className="text-[10px] text-indigo-300 font-semibold">USED</span>
                ) : (
                  <span className="text-[10px] text-slate-600">—</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────── 대화 히스토리 변환 ─────────────────────

// 화면의 메시지 목록을 Claude API 메시지 형식으로 변환한다.
// assistant 응답은 핵심 판정만 요약해 다음 요청의 맥락으로 전달한다.
function buildHistory(messages) {
  return messages.map((m) => {
    if (m.role === "user") {
      return { role: "user", content: m.content };
    }
    const r = m.result || {};
    const p = m.parsed || {};
    if (r.verdict === "대화") {
      return { role: "assistant", content: r.headline || "" };
    }
    const parts = [
      p.origin && p.destination ? `경로: ${p.origin} → ${p.destination}` : null,
      r.verdict ? `판정: ${r.verdict}(위험도 ${r.riskScore})` : null,
      r.headline ? `요약: ${r.headline}` : null,
    ].filter(Boolean);
    return { role: "assistant", content: `[이전 분석] ${parts.join(" / ")}` };
  });
}

// ───────────────────── App ─────────────────────

export default function App() {
  const [messages, setMessages] = useState([]);
  const [followup, setFollowup] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [liveWorkflow, setLiveWorkflow] = useState([]);
  const bottomRef = useRef(null);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading]);

  const handleSend = async (text) => {
    // 현재까지의 대화를 Claude 메시지 형식으로 변환해 맥락을 유지한다.
    const history = buildHistory(messages);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);
    setLiveWorkflow([]);
    setWorkflowOpen(false);

    try {
      const result = await runAgent(text, history, (step) => {
        setLiveWorkflow((prev) => [...prev, step]);
      });
      if (result) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            parsed: result.parsed,
            result: result.result,
            workflow: result.workflow,
            stats: result.stats,
          },
        ]);
      }
    } catch (err) {
      console.error("Agent 오류:", err);
    } finally {
      setIsLoading(false);
      setLiveWorkflow([]);
    }
  };

  const handleSuggestion = (s) => {
    handleSend(s.query);
  };

  const handleReset = () => {
    setMessages([]);
    setFollowup("");
    setWorkflowOpen(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .animate-fadeIn { animation: fadeIn 200ms ease-out; }
        .animate-slideIn { animation: slideIn 280ms cubic-bezier(0.2, 0.8, 0.2, 1); }
      `}</style>

      <Header
        onToggleWorkflow={() => setWorkflowOpen((v) => !v)}
        workflowOpen={workflowOpen}
        hasMessages={hasMessages}
        onReset={handleReset}
      />

      {!hasMessages ? (
        <Hero onSend={handleSend} onSuggestion={handleSuggestion} />
      ) : (
        <ChatList
          messages={messages}
          isLoading={isLoading}
          liveWorkflow={liveWorkflow}
          onOpenWorkflow={() => setWorkflowOpen(true)}
          scrollRef={bottomRef}
        />
      )}

      {hasMessages && (
        <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="max-w-3xl mx-auto px-6 pb-6 pointer-events-auto">
            <div className="bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-8 -mx-6 px-6">
              <Composer
                text={followup}
                setText={setFollowup}
                onSend={() => {
                  if (followup.trim() && !isLoading) {
                    handleSend(followup);
                    setFollowup("");
                  }
                }}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {workflowOpen && lastAssistant && (
        <WorkflowPanel data={lastAssistant} onClose={() => setWorkflowOpen(false)} />
      )}
    </div>
  );
}
