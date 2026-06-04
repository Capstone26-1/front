function haversineKm(x1, y1, x2, y2) {
  const R = 6371;
  const dLat = ((y2 - y1) * Math.PI) / 180;
  const dLon = ((x2 - x1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((y1 * Math.PI) / 180) *
      Math.cos((y2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateTaxiFare({ startX, startY, endX, endY }) {
  const straightKm = haversineKm(
    parseFloat(startX), parseFloat(startY),
    parseFloat(endX), parseFloat(endY)
  );
  const roadKm = straightKm * 1.3;

  const BASE_FARE = 4800;
  const BASE_KM = 1.6;
  let fare = BASE_FARE;
  if (roadKm > BASE_KM) {
    fare += Math.floor(((roadKm - BASE_KM) * 1000) / 131) * 100;
  }
  const nightFare = Math.ceil(fare * 1.2 / 100) * 100;
  const durationMinutes = Math.max(5, Math.round((roadKm / 30) * 60));

  return {
    distanceKm: Math.round(roadKm * 10) / 10,
    estimatedFare: fare,
    estimatedFareNight: nightFare,
    durationMinutes,
  };
}

function getCurrentTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export async function searchTransitRoute({ startX, startY, endX, endY, time }) {
  const queryTime = time || getCurrentTime();

  const res = await fetch("https://apis.openapi.sk.com/transit/routes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      appKey: process.env.REACT_APP_TMAP_API_KEY,
    },
    body: JSON.stringify({
      startX: String(startX),
      startY: String(startY),
      endX: String(endX),
      endY: String(endY),
      time: queryTime,
      count: 5,
      lang: 0,
      format: "json",
    }),
  });

  if (!res.ok) throw new Error(`Tmap API 오류: ${res.status}`);

  const data = await res.json();
  const itineraries = data.metaData?.plan?.itineraries;

  if (!itineraries?.length) {
    return {
      available: false,
      queryTime,
      message: "이용 가능한 대중교통 경로가 없습니다. 막차가 이미 지났을 수 있습니다.",
    };
  }

  const now = new Date();

  return {
    available: true,
    queryTime,
    currentTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    routes: itineraries.slice(0, 3).map((it, idx) => ({
      rank: idx + 1,
      totalTimeMinutes: Math.round((it.totalTime || 0) / 60),
      transferCount: it.transferCount ?? 0,
      totalFare: it.fare?.regular?.totalFare,
      legs: (it.legs || []).map((leg) => ({
        mode: leg.mode,
        durationMinutes: Math.round((leg.sectionTime || 0) / 60),
        fromName: leg.start?.name,
        toName: leg.end?.name,
        routeName: leg.route || null,
        departureTime: leg.start?.departureTime || null,
        arrivalTime: leg.end?.arrivalTime || null,
      })),
    })),
  };
}
