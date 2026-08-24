// 네이버 뉴스 검색 API. 가장 간단한 외부 신호 — 앱 등록만 하면 바로 키가 나온다.
// https://developers.naver.com (검색 API)
export async function fetchNewsCount(
  companyName: string,
): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", companyName);
  url.searchParams.set("display", "1");

  try {
    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { total?: number };
    return typeof data.total === "number" ? data.total : null;
  } catch {
    // 네트워크 오류, 타임아웃 등 — 화면은 합성 데이터로 계속 동작해야 한다.
    return null;
  }
}
