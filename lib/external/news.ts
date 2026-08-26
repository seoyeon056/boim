// 네이버 뉴스 검색 API — 네이버 클라우드 플랫폼(NCP) API Gateway 방식.
// 예전 openapi.naver.com 엔드포인트/헤더(X-Naver-Client-Id 등)는 이 계정 기준으로
// 더는 통하지 않는다(2026-08 네이버클라우드 고객센터 확인). 헤더 이름도 다르다.
// 가이드: https://api.ncloud-docs.com/docs/naver-api-hub-search-news

// 회사명을 그냥 넘기면 네이버가 형태소 단위로 쪼개서 매칭하기 때문에, 그 회사와
// 아무 상관 없는 기사까지 total에 들어간다. 실측으로 확인한 규모가 이 정도다:
//   한빛정밀      5,868건 → 따옴표 16건
//   미래온로보틱스 25,958건 → 따옴표 0건 (애초에 실존하지 않는 회사인데도 2만건대)
// 특허 쪽(patents.ts)은 응답의 출원인 필드를 다시 걸러서 이 문제를 막는데, 뉴스는
// total만 받아 쓰기 때문에 그런 사후 필터가 불가능하다. 대신 검색어를 큰따옴표로
// 감싸 네이버 쪽에서 구(句) 완전일치로 처리하게 한다.
//
// 실존 기업 수치는 이 필터로 거의 깎이지 않는 것도 확인했다
// (동일기연 3,627 → 3,627 / LG생활건강 288,656 → 288,321).
function toExactPhraseQuery(companyName: string): string {
  // 회사명 자체에 큰따옴표가 있으면 구문이 깨지므로 먼저 걷어낸다.
  return `"${companyName.replace(/"/g, " ").trim()}"`;
}

export async function fetchNewsCount(
  companyName: string,
): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
  url.searchParams.set("query", toExactPhraseQuery(companyName));
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
