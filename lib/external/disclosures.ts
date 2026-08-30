import { findCorpCode } from "@/lib/external/dart-corp-codes";

// DART(전자공시시스템) 공시검색 오픈API.
// https://opendart.fss.or.kr
//
// 뉴스·특허·고용이 "밖에서 이 회사가 얼마나 보이나"를 재는 지표라면, 공시는
// 회사가 스스로 의무적으로 내놓은 기록이라 성격이 다르다. 검색 노출과 무관하게
// 남는 흔적이라, 홍보를 안 해서 뉴스가 없는 회사와 실제로 활동이 없는 회사를
// 갈라준다.
//
// 최근 1년으로 창을 자르는 이유는 이 값이 "지금 활동 중인가"를 봐야 하는
// 지표이기 때문이다. 전체 기간 누적은 업력이 긴 회사가 무조건 유리해진다.
const DISCLOSURE_WINDOW_YEARS = 1;

// 조회된 데이터가 없을 때 DART가 내려주는 상태 코드. HTTP는 200으로 오고
// 본문 status만 013이라, 이걸 실패로 처리하면 공시가 진짜 0건인 회사가
// 합성 데이터로 덮여버린다. 0건은 0건으로 살려야 한다.
const STATUS_OK = "000";
const STATUS_NO_DATA = "013";

function toDartDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function fetchDisclosureCount(
  companyName: string,
): Promise<number | null> {
  const serviceKey = process.env.DART_SEARCH_KEY;
  if (!serviceKey) {
    return null;
  }

  // DART는 회사명 검색을 지원하지 않아 고유번호를 먼저 찾아야 한다.
  // 매핑표에 없는 회사(미등록 법인 등)는 여기서 판단을 포기한다.
  const corpCode = await findCorpCode(companyName);
  if (!corpCode) {
    return null;
  }

  const endDate = new Date();
  const beginDate = new Date(endDate);
  beginDate.setFullYear(beginDate.getFullYear() - DISCLOSURE_WINDOW_YEARS);

  const url = new URL("https://opendart.fss.or.kr/api/list.json");
  url.searchParams.set("crtfc_key", serviceKey);
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bgn_de", toDartDate(beginDate));
  url.searchParams.set("end_de", toDartDate(endDate));
  // 필요한 건 total_count뿐이라 목록은 최소로 받는다.
  url.searchParams.set("page_count", "1");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      status?: string;
      total_count?: number;
    };

    if (data.status === STATUS_NO_DATA) {
      return 0;
    }

    if (data.status !== STATUS_OK) {
      return null;
    }

    return typeof data.total_count === "number" ? data.total_count : null;
  } catch {
    return null;
  }
}
