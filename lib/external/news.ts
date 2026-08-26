// 네이버 뉴스 검색 API — 네이버 클라우드 플랫폼(NCP) API Gateway 방식.
// 예전 openapi.naver.com 엔드포인트/헤더(X-Naver-Client-Id 등)는 이 계정 기준으로
// 더는 통하지 않는다(2026-08 네이버클라우드 고객센터 확인). 헤더 이름도 다르다.
// 가이드: https://api.ncloud-docs.com/docs/naver-api-hub-search-news
export async function fetchNewsCount(
  companyName: string,
): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
  url.searchParams.set("query", companyName);
  url.searchParams.set("display", "1");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
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
