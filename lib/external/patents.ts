// KIPRIS Plus 특허 검색 오픈API. 셋 중 신청 절차가 제일 무겁다(문의 전화 안내까지 있음).
// https://plus.kipris.or.kr
//
// 처음엔 getWordSearch(일반 키워드 검색)를 썼는데, 이건 특허 전문(제목/초록)을
// 뒤지는 거라 회사명이 흔한 한국어 단어로 이뤄지면("동일기연" → "동일") 완전히
// 무관한 특허가 수백 건씩 걸리고, 정작 진짜 그 회사 특허는 노출 순위에 밀려
// numOfRows=500까지 늘려도 안 잡히는 걸 실측으로 확인했다.
//
// applicantNameSearchInfo는 출원인 필드만 뒤지는 전용 오퍼레이션이라 훨씬
// 깨끗하다("동일기연" 검색 시 실제 (주)동일기연의 특허가 바로 잡힘). 다만 이것도
// 완전 정확 일치는 아니라("한빛정밀" 검색에 무관한 "한빛티앤아이"가 걸림, 아마
// 형태소 단위로 느슨하게 매칭하는 듯) 응답의 Applicant 필드가 검색어를 실제로
// 포함하는 항목만 다시 한번 걸러서 센다.
import { toKoreanLetterSpelling } from "@/lib/korean";

function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// 이 검색은 완전 정확일치가 아니라서 응답에 들어 있는 총건수(TotalSearchCount)를
// 그대로 쓰면 안 된다. 실측:
//
//   한빛정밀: 총 12건이 잡히지만 전부 무관한 출원인 → 실제 0건
//   포스코:   총 52,561건, 앞 30건은 전부 일치하는데 끝 30건은 0건 일치
//             (포스코플랜텍이 "주식회사 플랜텍"으로 등록돼 있다)
//
// 앞부분만 표본으로 보고 "나머지도 깨끗하겠지"라고 넘기면 포스코 특허가
// 52,561건으로 나온다. 그래서 추론하지 않고 실제로 받아서 센다.
//
// 상한까지는 전부 받아 정확한 건수를 내고, 상한을 넘으면 받은 만큼만
// "N건 이상"으로 말한다. 이 서비스의 대상인 중소기업은 대부분 상한 안에
// 들어와서 추론 없는 정확한 값이 나온다(실측: 한빛정밀 12건 0.3초,
// 동일기연 106건 9.5초 / 상한을 넘는 건 아모텍 885건·대기업 정도다).
const PAGE_SIZE = 30;
const MAX_COUNTED = 300;

// 페이지당 1~5초인데 느린 날이 있다. 상한까지 받아도 실측 10초 안쪽이었다.
const REQUEST_TIMEOUT_MS = 15000;

export type PatentCountResult = {
  count: number;
  isAtLeast: boolean;
};

export async function fetchPatentCount(
  companyName: string,
): Promise<PatentCountResult | null> {
  const serviceKey = process.env.KIPRIS_SERVICE_KEY;

  if (!serviceKey) {
    return null;
  }

  // 한국 특허는 출원인명이 한글로 등록된다("LG CNS" → "주식회사 엘지씨엔에스").
  // 알파벳이 섞여 있으면 한글 발음으로 바꿔서 검색해야 실제로 걸린다
  // (실측: LG→엘지, SK→에스케이, KT→케이티 전부 실제 출원인명에서 확인됨).
  const searchWord = toKoreanLetterSpelling(companyName);

  const url = new URL(
    "http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/applicantNameSearchInfo",
  );
  url.searchParams.set("applicant", searchWord);
  url.searchParams.set("patent", "true");
  url.searchParams.set("utility", "true");
  url.searchParams.set("accessKey", serviceKey);

  const normalizedTarget = normalizeCompanyName(searchWord);

  // 한 페이지를 받아 이 회사가 출원인인 건수와 검색 총건수를 돌려준다.
  const readPage = async (
    start: number,
  ): Promise<{ matching: number; read: number; total: number }> => {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("docsStart", String(start));
    pageUrl.searchParams.set("docsCount", String(PAGE_SIZE));

    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`KIPRIS HTTP ${response.status}`);
    }

    const xml = await response.text();
    const applicants = [...xml.matchAll(/<Applicant>(.*?)<\/Applicant>/g)];

    return {
      matching: applicants.filter(([, name]) =>
        normalizeCompanyName(name).includes(normalizedTarget),
      ).length,
      read: applicants.length,
      total: Number(
        xml.match(/<TotalSearchCount>(\d+)<\/TotalSearchCount>/)?.[1],
      ),
    };
  };

  try {
    const first = await readPage(1);

    // 총건수를 못 읽었으면 본 것만 말한다.
    if (!Number.isFinite(first.total)) {
      return { count: first.matching, isAtLeast: first.read > 0 };
    }

    // 첫 페이지에서 이미 다 봤다.
    if (first.total <= first.read) {
      return { count: first.matching, isAtLeast: false };
    }

    // 나머지 페이지. 첫 페이지에서 총건수를 알았으니 한꺼번에 받는다.
    const countUpTo = Math.min(first.total, MAX_COUNTED);
    const starts: number[] = [];
    for (let start = first.read + 1; start <= countUpTo; start += PAGE_SIZE) {
      starts.push(start);
    }

    const rest = await Promise.all(starts.map(readPage));
    const matching =
      first.matching + rest.reduce((sum, page) => sum + page.matching, 0);

    // 상한을 넘겨 다 못 본 경우에만 "이상"이다. 상한 안이면 전수 확인이라
    // 정확한 수치다.
    return { count: matching, isAtLeast: first.total > MAX_COUNTED };
  } catch {
    return null;
  }
}
