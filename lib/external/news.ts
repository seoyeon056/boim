// 네이버 뉴스 검색 API — 네이버 클라우드 플랫폼(NCP) API Gateway 방식.
// 예전 openapi.naver.com 엔드포인트/헤더(X-Naver-Client-Id 등)는 이 계정 기준으로
// 더는 통하지 않는다(2026-08 네이버클라우드 고객센터 확인). 헤더 이름도 다르다.
// 가이드: https://api.ncloud-docs.com/docs/naver-api-hub-search-news

// 회사명을 그냥 넘기면 네이버가 형태소 단위로 쪼개서 매칭하기 때문에, 그 회사와
// 아무 상관 없는 기사까지 total에 들어간다. 실측 규모가 이 정도다:
//   한빛정밀      5,868건 (상위 100건 중 실제로 그 회사 기사인 건 0건)
//   미래온로보틱스 25,958건 (애초에 실존하지 않는 합성 데이터 회사인데도)
//
// 그래서 두 단계로 거른다.
//
// 1) 검색어를 큰따옴표로 감싸 네이버 쪽에서 구(句) 완전일치로 처리하게 한다.
//    이것만으로 한빛정밀이 5,868 → 16건까지 줄고, 실존 기업 수치는 거의 그대로다
//    (동일기연 3,627 → 3,627 / LG생활건강 288,656 → 288,321).
//
// 2) 그래도 완전하지는 않다. 실측하면 따옴표 검색에도 "학생교육원 한빛관 정밀점검용역"
//    같은 기사가 남는다 — 네이버가 따옴표 안에서도 "한빛"과 "정밀"을 쪼갠다.
//    그래서 받은 기사의 제목·설명에 회사명이 실제로 들어 있는지 한 번 더 본다.
//    특허 쪽(patents.ts)이 출원인 필드를 재검증하는 것과 같은 방식이다.
const MAX_DISPLAY = 100;

export type NewsCountResult = {
  count: number;
  isAtLeast: boolean;
};

function toExactPhraseQuery(companyName: string): string {
  // 회사명 자체에 큰따옴표가 있으면 구문이 깨지므로 먼저 걷어낸다.
  return `"${companyName.replace(/"/g, " ").trim()}"`;
}

function stripMarkup(value: string): string {
  return value
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export async function fetchNewsCount(
  companyName: string,
): Promise<NewsCountResult | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
  url.searchParams.set("query", toExactPhraseQuery(companyName));
  // display를 올려도 호출 수는 그대로 1회다. 검증 표본을 공짜로 얻는 셈이라
  // 상한(100)까지 받는다.
  url.searchParams.set("display", String(MAX_DISPLAY));
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

    const data = (await response.json()) as {
      total?: number;
      items?: { title?: string; description?: string }[];
    };

    if (typeof data.total !== "number") {
      return null;
    }

    const items = data.items ?? [];
    const target = normalize(companyName);
    const matchingCount = items.filter((item) =>
      normalize(
        stripMarkup(item.title ?? "") + " " + stripMarkup(item.description ?? ""),
      ).includes(target),
    ).length;

    // total이 받은 개수 이하면 결과 전체를 본 것이다. 걸러낸 수가 곧 정답이다.
    // (한빛정밀: total 16건을 다 받아 확인 → 2건이 무관 기사라 14건)
    if (data.total <= items.length) {
      return { count: matchingCount, isAtLeast: false };
    }

    // total이 100을 넘으면 나머지는 못 본다. 대신 받은 100건이 전부 실제로 그
    // 회사 기사라면 따옴표 필터가 이 검색어에서는 깨끗하게 동작한다는 뜻이라
    // total을 그대로 신뢰한다. 실측한 100건 초과 사례(LG생활건강·LG CNS·
    // LG유플러스·동일기연·아모텍·성우전자·한국첨단소재·제이앤티씨·코아스템켐온)는
    // 전부 100/100이었다.
    if (matchingCount === items.length) {
      return { count: data.total, isAtLeast: false };
    }

    // 표본이 오염됐는데 전체는 볼 수 없는 경우. total을 그대로 쓰면 부풀린 값을
    // 정확한 수치인 양 내보내게 되니, 확인된 건수만 "이상"으로 표시한다.
    return { count: matchingCount, isAtLeast: true };
  } catch {
    // 네트워크 오류, 타임아웃 등 — 화면은 합성 데이터로 계속 동작해야 한다.
    return null;
  }
}
