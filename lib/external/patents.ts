// KIPRIS Plus 특허 검색 오픈API. 셋 중 신청 절차가 제일 무겁다(문의 전화 안내까지 있음).
// https://plus.kipris.or.kr
//
// getWordSearch는 출원인 전용 검색이 아니라 일반 키워드 검색이다. "LG CNS"처럼
// 회사명에 흔한 영단어(CNS = 중추신경계)가 섞이면 전혀 무관한 제약 특허까지
// 걸려서(실측: "CNS" 단독 검색만으로 무관 업체 다수 확인) <item> 개수를 그대로
// 세면 노이즈가 심하다. 그래서 응답에 포함된 출원인명(applicantName)이 실제로
// 회사명을 포함하는 항목만 걸러서 센다.
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

export async function fetchPatentCount(
  companyName: string,
): Promise<number | null> {
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
    "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch",
  );
  url.searchParams.set("word", searchWord);
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
    const normalizedTarget = normalizeCompanyName(searchWord);

    const applicants = [...xml.matchAll(/<applicantName>(.*?)<\/applicantName>/g)];
    const matchingCount = applicants.filter(([, name]) =>
      normalizeCompanyName(name).includes(normalizedTarget),
    ).length;

    return matchingCount;
  } catch {
    return null;
  }
}
