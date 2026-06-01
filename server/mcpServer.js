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

    return { stationName, hasDisruption, isLastTrain, trains, congestionLevel };
  } catch {
    return {
      stationName,
      hasDisruption: false,
      isLastTrain: false,
      trains: [],
      congestionLevel: "normal",
    };
  }
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
      "지하철 실시간 운행 지연·혼잡도를 조회합니다. 지하철 포함 경로이거나 심야 시간대(22시 이후) 운행 이상이 우려될 때 호출하세요.",
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
    name: "news_context_tool",
    description:
      "뉴스 검색으로 교통 이상의 원인을 파악합니다. road_incident_tool에서 사고·통제가 감지되거나 search_transit_route 결과가 비정상(경로 없음·우회)일 때 반드시 호출하세요. 결과의 issues 배열에 따라 추가 도구를 선택하세요: '날씨'→weather_alert_tool, '지하철지연'→transit_disruption_tool, '행사혼잡'→public_event_tool",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "검색 쿼리 (예: '강남 사당 교통 막힘 원인', '2호선 지연 사고')",
        },
      },
      required: ["query"],
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
  return "";
}
