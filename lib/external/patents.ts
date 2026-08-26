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
function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// 한국 특허는 출원인명이 한글로 등록된다("LG CNS" → "주식회사 엘지씨엔에스").
// LG/SK/CJ/KT처럼 영문 이니셜로 된 회사명은 알파벳을 한 글자씩 소리나는 대로
// 한글로 바꾼 형태로 검색해야 실제로 걸린다(실측: LG→엘지, SK→에스케이,
// KT→케이티 전부 실제 출원인명에서 확인됨). 특정 대기업 몇 개를 하드코딩하는
// 대신 알파벳 26자 전체를 매핑해서, 앞으로 나올 어떤 이니셜형 회사명에도 적용된다.
const KOREAN_LETTER_NAMES: Record<string, string> = {
  A: "에이", B: "비", C: "씨", D: "디", E: "이", F: "에프", G: "지",
  H: "에이치", I: "아이", J: "제이", K: "케이", L: "엘", M: "엠", N: "엔",
  O: "오", P: "피", Q: "큐", R: "알", S: "에스", T: "티", U: "유",
  V: "브이", W: "더블유", X: "엑스", Y: "와이", Z: "지",
};

function toKoreanLetterSpelling(value: string): string {
  return [...value.toUpperCase()]
    .map((char) => KOREAN_LETTER_NAMES[char] ?? char)
    .join("");
}

// KIPRIS가 한 번에 내려주는 최대 건수(500 초과 요청해도 500까지만 옴, 실측 확인).
// 페이지가 이 값만큼 꽉 찼다는 건 뒤에 더 있을 수도 있다는 뜻이라, 그럴 땐
// "정확히 N건"이 아니라 "N건 이상"으로 표시해야 한다.
const MAX_DOCS_PER_PAGE = 500;

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

  // 영문 알파벳이 하나라도 있으면 한글 발음으로 바꿔서 검색한다.
  // 이미 한글인 회사명(우리 실제 데이터 대부분)은 이 매핑을 거쳐도 그대로다.
  const searchWord = /[a-zA-Z]/.test(companyName)
    ? toKoreanLetterSpelling(companyName)
    : companyName;

  const url = new URL(
    "http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/applicantNameSearchInfo",
  );
  url.searchParams.set("applicant", searchWord);
  url.searchParams.set("patent", "true");
  url.searchParams.set("utility", "true");
  url.searchParams.set("docsStart", "1");
  url.searchParams.set("docsCount", String(MAX_DOCS_PER_PAGE));
  url.searchParams.set("accessKey", serviceKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const normalizedTarget = normalizeCompanyName(searchWord);

    const applicants = [...xml.matchAll(/<Applicant>(.*?)<\/Applicant>/g)];
    const matchingCount = applicants.filter(([, name]) =>
      normalizeCompanyName(name).includes(normalizedTarget),
    ).length;

    // 필터링 전 원본 페이지 자체가 상한을 꽉 채웠으면, 다음 페이지에 검색어와
    // 일치하는 항목이 더 있을 수도 있다는 뜻이라 "이상"으로 표시해야 정직하다.
    return {
      count: matchingCount,
      isAtLeast: applicants.length >= MAX_DOCS_PER_PAGE,
    };
  } catch {
    return null;
  }
}
