const KAKAO_API_KEY = process.env.REACT_APP_KAKAO_API_KEY;

// Kakao 키워드 검색으로 장소명 → 위경도 좌표 변환
// returns: { name, x(경도), y(위도), address, category }
export async function searchLocation(query) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
    { headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` } }
  );

  if (!res.ok) throw new Error(`Kakao API 오류: ${res.status}`);

  const data = await res.json();
  if (!data.documents?.length) throw new Error(`장소를 찾을 수 없습니다: ${query}`);

  const place = data.documents[0];
  return {
    name: place.place_name,
    x: place.x, // 경도 (longitude)
    y: place.y, // 위도 (latitude)
    address: place.road_address_name || place.address_name,
    category: place.category_name,
  };
}
