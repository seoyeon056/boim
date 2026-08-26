// 네이버 뉴스 검색 API — 네이버 클라우드 플랫폼(NCP) API Gateway 방식.
// 예전 openapi.naver.com 엔드포인트/헤더(X-Naver-Client-Id 등)는 이 계정 기준으로
// 더는 통하지 않는다(2026-08 네이버클라우드 고객센터 확인). 헤더 이름도 다르다.
// 가이드: https://api.ncloud-docs.com/docs/naver-api-hub-search-news
//
// 응답의 total은 특허 이슈와 같은 함정이 있다 — "한빛정밀" 같은 회사명은
// "한빛"·"정밀" 각각 흔한 단어라 total이 5,868까지 나오는데 전부 무관한 기사다
// (실측 확인). 따옴표로 감싼 정확 일치 검색도 시도해봤지만 "LG CNS"처럼 진짜
// 회사에는 거의 효과가 없어서(148,718 → 146,671) 신뢰할 수 없었다. 그래서 응답
// 기사의 제목/설명에 회사명이 실제로 포함된 것만 걸러서 센다.
function normalizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;|&amp;|&lt;|&gt;/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 네이버가 한 번에 허용하는 최대 건수(100 초과 요청하면 400 에러, 실측 확인).
const MAX_DISPLAY = 100;

export type NewsCountResult = {
  count: number;
  isAtLeast: boolean;
};

export async function fetchNewsCount(
  companyName: string,
): Promise<NewsCountResult | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
  url.searchParams.set("query", companyName);
  url.searchParams.set("display", String(MAX_DISPLAY));
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      items?: { title: string; description: string }[];
    };
    const items = data.items ?? [];
    const normalizedTarget = normalizeText(companyName);

    const matchingCount = items.filter(
      (item) =>
        normalizeText(item.title).includes(normalizedTarget) ||
        normalizeText(item.description).includes(normalizedTarget),
    ).length;

    // 원본 페이지가 상한을 꽉 채웠으면 필터링 후에도 더 있을 수 있다.
    // 단, 매칭 건수가 0이면 "0건 이상"이라는 의미 없는 문구가 되니 표시하지 않는다.
    return {
      count: matchingCount,
      isAtLeast: matchingCount > 0 && items.length >= MAX_DISPLAY,
    };
  } catch {
    // 네트워크 오류, 타임아웃 등 — 화면은 합성 데이터로 계속 동작해야 한다.
    return null;
  }
}
