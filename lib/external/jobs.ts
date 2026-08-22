// 워크넷(고용정보원) 채용정보 오픈API. 공공데이터포털에서 활용신청 필요, 뉴스 API보다 승인 절차가 있다.
// http://openapi.work.go.kr
//
// XML 응답에서 총 건수 태그명이 문서마다 다르게 적혀 있어 신뢰하기 어려워서,
// 대신 응답에 포함된 <item> 개수를 센다. display로 요청한 건수(최대 100)를
// 넘는 정확한 총량은 아니지만, 가시성 "신호"로는 충분하다.
export async function fetchJobCount(
  companyName: string,
): Promise<number | null> {
  const authKey = process.env.WORKNET_AUTH_KEY;

  if (!authKey) {
    return null;
  }

  const url = new URL("http://openapi.work.go.kr/opi/opi/opia/wantedApi.do");
  url.searchParams.set("authKey", authKey);
  url.searchParams.set("callTp", "L");
  url.searchParams.set("returnType", "XML");
  url.searchParams.set("startPage", "1");
  url.searchParams.set("display", "100");
  url.searchParams.set("keyword", companyName);

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
