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
