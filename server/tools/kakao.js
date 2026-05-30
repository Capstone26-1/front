export async function searchLocation(query) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
    { headers: { Authorization: `KakaoAK ${process.env.REACT_APP_KAKAO_API_KEY}` } }
  );

  if (!res.ok) throw new Error(`Kakao API 오류: ${res.status}`);

  const data = await res.json();
  if (!data.documents?.length) throw new Error(`장소를 찾을 수 없습니다: ${query}`);

  const place = data.documents[0];
  return {
    name: place.place_name,
    x: place.x,
    y: place.y,
    address: place.road_address_name || place.address_name,
    category: place.category_name,
  };
}
