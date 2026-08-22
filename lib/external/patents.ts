// KIPRIS Plus 특허 검색 오픈API. 셋 중 신청 절차가 제일 무겁다(문의 전화 안내까지 있음).
// https://plus.kipris.or.kr
//
// getWordSearch는 출원인 전용 검색이 아니라 일반 키워드 검색이라, 기업명으로 찾으면
// "이 기업명이 언급된 특허/실용신안 공보" 근사치가 나온다. 워크넷과 같은 이유로
// XML의 <item> 개수를 센다.
export async function fetchPatentCount(
  companyName: string,
): Promise<number | null> {
  const serviceKey = process.env.KIPRIS_SERVICE_KEY;

  if (!serviceKey) {
    return null;
  }

  const url = new URL(
    "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch",
  );
  url.searchParams.set("word", companyName);
  url.searchParams.set("patent", "true");
  url.searchParams.set("utility", "true");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("ServiceKey", serviceKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const itemCount = (xml.match(/<item>/g) ?? []).length;
    return itemCount;
  } catch {
    return null;
  }
}
