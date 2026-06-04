import { estimateTaxiFare, searchTransitRoute } from "./tools/tmap.js";
import { validateSubwayLeg } from "./tools/subwayValidator.js";

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getNearestBaseTime() {
  const h = new Date().getHours();
  const times = [2, 5, 8, 11, 14, 17, 20, 23];
  let nearest = times[0];
  for (const t of times) {
    if (h >= t) nearest = t;
  }
  return String(nearest).padStart(2, "0") + "00";
}

async function weatherAlertHandler({ location }) {
  try {
    const params = new URLSearchParams({
      serviceKey: process.env.WEATHER_API_KEY,
      pageNo: "1",
      numOfRows: "10",
      dataType: "JSON",
      base_date: getTodayStr(),
      base_time: getNearestBaseTime(),
      nx: "60",
      ny: "127",
    });
    const res = await fetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`
    );
    const json = await res.json();
    const items = json?.response?.body?.items?.item ?? [];

    const pcp = items.find((i) => i.category === "PCP");
    const wsd = items.find((i) => i.category === "WSD");
    const pty = items.find((i) => i.category === "PTY");

    const ptyVal = pty ? Number(pty.fcstValue) : 0;
    const pcpVal = pcp ? pcp.fcstValue : "0";
    const wsdVal = wsd ? Number(wsd.fcstValue) : 0;

    let alertLevel = "normal";
    let hasAlert = false;
    let description = "맑음";

    if (ptyVal > 0 || pcpVal !== "0") {
      hasAlert = true;
      const pcpNum = parseFloat(pcpVal) || 0;
      if (pcpNum >= 30 || wsdVal >= 14) {
        alertLevel = "severe";
        description = `강한 강수(${pcpVal}mm) 및 강풍(${wsdVal}m/s)`;
      } else if (pcpNum >= 10 || wsdVal >= 9) {
        alertLevel = "warning";
        description = `강수(${pcpVal}mm) 주의`;
      } else {
        alertLevel = "caution";
        description = `약한 강수(${pcpVal}mm)`;
      }
    }

    return {
      hasAlert,
      alertLevel,
      description,
      details: { pcp: pcpVal, wsd: wsdVal, pty: ptyVal },
    };
  } catch {
    return {
      hasAlert: false,
      alertLevel: "normal",
      description: "기상 정보 조회 불가 (정상 날씨로 가정)",
      details: {},
    };
  }
}

// waypoints: 경로 경유 지역명 배열 (제공 시 area 대신 전체 경로 조회)
async function roadIncidentHandler({ area, waypoints }) {
  try {
    const params = new URLSearchParams({
      apiKey: process.env.ROAD_INCIDENT_API_KEY,
      type: "all",
      body: "y",
      getType: "json",
    });
    const res = await fetch(
      `https://openapi.its.go.kr:9443/trafficInfo?${params}`
    );
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];

    const searchAreas =
      waypoints && waypoints.length > 0 ? waypoints : area ? [area] : [];

    const filtered = items
      .filter((item) => {
        const loc = (item.location || item.roadName || "").toString();
        if (searchAreas.length === 0) return true;
        return searchAreas.some((a) => loc.includes(a));
      })
      .map((item) => ({
        type: item.inciType || item.type || "unknown",
        location: item.location || item.roadName || "",
        description: item.inciInfo || item.description || "",
        severity: item.severity || "unknown",
      }));

    return {
      hasIncident: filtered.length > 0,
      incidents: filtered,
      totalCount: filtered.length,
    };
  } catch {
    return { hasIncident: false, incidents: [], totalCount: 0 };
  }
}

async function transitDisruptionHandler({ stationName }) {
  try {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${process.env.SEOUL_METRO_API_KEY}/json/realtimeStationArrival/0/5/${encodeURIComponent(stationName)}`;
    const res = await fetch(url);
    const json = await res.json();
    const list = json?.realtimeArrivalList ?? [];

    const trains = list.map((t) => ({
      line: t.subwayId || "",
      destination: t.trainLineNm || "",
      arrivalMsg: t.arvlMsg2 || "",
      isLastCar: t.lstcarAt === "1",
    }));

    const isLastTrain = trains.some((t) => t.isLastCar);
    const hasDisruption = list.some((t) => {
      const barvlDt = Number(t.barvlDt || 0);
      return barvlDt > 600;
    });

    let congestionLevel = "normal";
    if (list.length > 0) {
      const avgTime =
        list.reduce((s, t) => s + Number(t.barvlDt || 0), 0) / list.length;
      if (avgTime > 300) congestionLevel = "crowded";
      if (avgTime > 480) congestionLevel = "very_crowded";
    }

    const lastTrain = trains.find((t) => t.isLastCar);
    return {
      stationName,
      hasDisruption,
      isLastTrain,
      trains,
      congestionLevel,
      lastTrainDestination: lastTrain?.destination || null,
    };
  } catch {
    return {
      stationName,
      hasDisruption: false,
      isLastTrain: false,
      trains: [],
      congestionLevel: "normal",
      apiError: true,
    };
  }
}

async function validateTransitRouteHandler({ legs, departureTime, endX, endY, finalDestination }) {
  const results = [];
  let firstBlock = null;

  for (const leg of legs) {
    if (leg.mode !== "SUBWAY") {
      results.push({ ...leg, feasible: true, skipped: true });
      continue;
    }
    const verdict = await validateSubwayLeg({
      line: leg.routeName,
      fromStation: leg.fromName,
      toStation: leg.toName,
      departureTime,
    });
    results.push({ ...leg, ...verdict });
    if (!verdict.feasible && !firstBlock) {
      firstBlock = { station: verdict.terminus, reason: verdict.reason };
    }
  }

  if (!firstBlock) return { results, hasInfeasibleLegs: false, lastReachableStation: null, altRoute: null };

  let altRoute = null;
  try {
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(firstBlock.station + "역")}`,
      { headers: { Authorization: `KakaoAK ${process.env.REACT_APP_KAKAO_API_KEY}` } }
    );
    const kakaoData = await kakaoRes.json();
    const place = kakaoData.documents?.[0];
    if (place) {
      altRoute = await searchTransitRoute({ startX: place.x, startY: place.y, endX, endY });
    }
  } catch {
    // 재탐색 실패 시 null — Claude가 택시 대안으로 처리
  }

  return {
    results,
    hasInfeasibleLegs: true,
    lastReachableStation: firstBlock.station,
    blockReason: firstBlock.reason,
    altRoute,
  };
}

function publicEventHandler({ location }) {
  const EVENTS = {
    잠실: {
      eventName: "LG vs KT 야구 경기",
      estimatedCrowd: 25000,
      endTime: "22:30",
      affectedLines: ["2호선"],
    },
    상암: {
      eventName: "K리그 경기",
      estimatedCrowd: 40000,
      endTime: "22:00",
      affectedLines: ["6호선"],
    },
    고척: {
      eventName: "KBO 야구 경기",
      estimatedCrowd: 18000,
      endTime: "22:00",
      affectedLines: ["1호선", "7호선"],
    },
    올림픽공원: {
      eventName: "대형 콘서트",
      estimatedCrowd: 20000,
      endTime: "22:30",
      affectedLines: ["5호선", "8호선"],
    },
  };

  for (const [keyword, data] of Object.entries(EVENTS)) {
    if (location.includes(keyword)) {
      return { hasEvent: true, ...data };
    }
  }

  return {
    hasEvent: false,
    eventName: "",
    estimatedCrowd: 0,
    endTime: "",
    affectedLines: [],
  };
}

function taxiFareHandler({ startX, startY, endX, endY, startName, endName }) {
  const result = estimateTaxiFare({ startX, startY, endX, endY });
  return {
    startName: startName || "출발지",
    endName: endName || "목적지",
    ...result,
  };
}

async function newsContextHandler({ query }) {
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=date`,
      {
        headers: {
          "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
          "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
        },
      }
    );
    const json = await res.json();
    const items = json?.items ?? [];

    const headlines = items.map((i) => i.title.replace(/<[^>]+>/g, ""));
    const fullText = [
      ...headlines,
      ...items.map((i) => i.description || ""),
    ].join(" ");

    const ISSUE_MAP = {
      날씨: ["폭우", "호우", "태풍", "폭설", "강풍", "기상특보"],
      도로통제: ["사고", "통제", "차단", "봉쇄", "붕괴", "철거", "공사"],
      지하철지연: ["지하철", "전철", "지연", "운행중단", "파업"],
      행사혼잡: ["경기", "콘서트", "공연", "축제", "행사"],
    };

    const issues = [];
    for (const [issue, keywords] of Object.entries(ISSUE_MAP)) {
      if (keywords.some((k) => fullText.includes(k))) issues.push(issue);
    }

    const summary =
      headlines.length > 0
        ? `관련 뉴스 ${headlines.length}건: ${headlines.slice(0, 2).join(" / ")}`
        : "관련 뉴스 없음";

    return { hasIssue: issues.length > 0, issues, headlines, summary };
  } catch {
    return {
      hasIssue: false,
      issues: [],
      headlines: [],
      summary: "뉴스 조회 실패",
    };
  }
}

export const NEWS_CONTEXT_TOOL = {
  name: "news_context_tool",
  description:
    "출발지·목적지 경로 주변의 교통 영향 뉴스를 검색합니다. 행사·사고·날씨·지하철 이슈를 감지해 위험도 계산에 반영합니다. search_transit_route 직후 반드시 호출하세요.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "출발지·목적지·경로 주요 지명 기반 검색 쿼리 (예: '강남 사당 교통 사고 행사 지연')",
      },
    },
    required: ["query"],
  },
};

export const MCP_TOOLS = [
  {
    name: "weather_alert_tool",
    description:
      "현재 기상 특보 및 날씨 위험도를 조회합니다. 사용자가 날씨/비/눈/폭우를 언급하거나 기상 상황이 막차 위험에 영향을 줄 수 있을 때 호출하세요.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "조회할 지역명 (예: 서울)",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "road_incident_tool",
    description:
      "도로 돌발상황(사고, 통제, 공사)을 조회합니다. 경로 탐색 이상이 감지되거나 도로 상황이 막차 지연에 영향을 줄 수 있을 때 호출하세요.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description: "조회할 도로/지역명 (예: 강남, 한강대교)",
        },
        waypoints: {
          type: "array",
          items: { type: "string" },
          description:
            "경로 경유지 지역명 목록 — 제공 시 경로 전체를 조회합니다 (예: ['강남', '반포', '사당'])",
        },
      },
      required: ["area"],
    },
  },
  {
    name: "transit_disruption_tool",
    description:
      "지하철 실시간 운행 지연·혼잡도 및 막차 여부를 조회합니다. 시간대 무관하게 항상 호출하세요 — 막차 종료 여부를 확인하는 핵심 도구입니다.",
    input_schema: {
      type: "object",
      properties: {
        stationName: {
          type: "string",
          description: "조회할 지하철역 이름 (예: 강남, 홍대입구)",
        },
      },
      required: ["stationName"],
    },
  },
  {
    name: "public_event_tool",
    description:
      "대형 공연·스포츠 행사로 인한 혼잡을 조회합니다. 잠실·상암·고척 등 대형 경기장 인근 역이 포함될 때 호출하세요.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "경기장/행사 인근 지역명 (예: 잠실, 상암, 고척)",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "taxi_fare_tool",
    description:
      "두 지점 간 택시 예상 요금을 계산합니다. search_transit_route가 available: false를 반환했거나, 경로는 있으나 riskScore ≥ 70이고 조회 시각이 22:00 이후인 경우 반드시 호출하세요.",
    input_schema: {
      type: "object",
      properties: {
        startX: { type: "number", description: "출발지 경도" },
        startY: { type: "number", description: "출발지 위도" },
        endX: { type: "number", description: "목적지 경도" },
        endY: { type: "number", description: "목적지 위도" },
        startName: { type: "string", description: "출발지명 (예: 삼각지역)" },
        endName: { type: "string", description: "목적지명 (예: 인덕원역)" },
      },
      required: ["startX", "startY", "endX", "endY"],
    },
  },
  {
    name: "validate_transit_route",
    description: "Tmap 경로의 지하철 leg마다 Anthropic AI로 막차 종착역을 검증. 도달 불가 시 해당 지점에서 최종 목적지까지 Tmap 대안 경로를 자동 재탐색한다.",
    input_schema: {
      type: "object",
      properties: {
        legs: {
          type: "array",
          description: "search_transit_route 결과의 legs 배열",
          items: {
            type: "object",
            properties: {
              mode: { type: "string" },
              routeName: { type: "string" },
              fromName: { type: "string" },
              toName: { type: "string" },
            },
          },
        },
        departureTime: { type: "string", description: "출발 시각 (HH:MM 형식, 예: 23:40)" },
        endX: { type: "string", description: "최종 목적지 경도" },
        endY: { type: "string", description: "최종 목적지 위도" },
        finalDestination: { type: "string", description: "최종 목적지 역명 (표시용)" },
      },
      required: ["legs", "departureTime", "endX", "endY", "finalDestination"],
    },
  },
];

export async function executeMcpTool(name, input) {
  if (name === "weather_alert_tool") return await weatherAlertHandler(input);
  if (name === "road_incident_tool") return await roadIncidentHandler(input);
  if (name === "transit_disruption_tool")
    return await transitDisruptionHandler(input);
  if (name === "public_event_tool") return publicEventHandler(input);
  if (name === "news_context_tool") return await newsContextHandler(input);
  if (name === "taxi_fare_tool") return taxiFareHandler(input);
  if (name === "validate_transit_route") return await validateTransitRouteHandler(input);
  throw new Error(`알 수 없는 MCP tool: ${name}`);
}

export function summarizeMcpTool(name, result) {
  if (name === "weather_alert_tool")
    return `날씨 ${result.alertLevel}: ${result.description}`;
  if (name === "road_incident_tool")
    return result.hasIncident
      ? `돌발상황 ${result.totalCount}건: ${result.incidents[0]?.description}`
      : "도로 정상";
  if (name === "transit_disruption_tool")
    return `${result.stationName}역 열차 ${result.trains.length}편 조회${result.isLastTrain ? " (막차 포함)" : ""}`;
  if (name === "public_event_tool")
    return result.hasEvent
      ? `행사: ${result.eventName} (관중 ${result.estimatedCrowd.toLocaleString()}명)`
      : "주변 행사 없음";
  if (name === "news_context_tool")
    return result.hasIssue
      ? `뉴스 이슈 감지 (${result.issues.join(", ")}): ${result.headlines[0] || ""}`
      : "관련 뉴스 없음";
  if (name === "taxi_fare_tool")
    return `택시 ${result.startName}→${result.endName}: 약 ${result.estimatedFare.toLocaleString()}원 (심야 ${result.estimatedFareNight.toLocaleString()}원), ${result.distanceKm}km`;
  if (name === "validate_transit_route")
    return result.hasInfeasibleLegs
      ? `막차 도달 불가: ${result.lastReachableStation}까지만 가능 — ${result.blockReason}`
      : "모든 지하철 구간 막차 도달 가능";
  return "";
}
