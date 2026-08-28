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

// 응답에 검색 총건수(TotalSearchCount)가 들어 있다. 건수만 필요하니 특허를
// 통째로 받을 이유가 없다. 예전에는 500건을 받아 세느라 느려서 8초 제한에 자주
// 걸렸고(실측: 삼성전자 500건 요청은 60초에도 응답 없음), 성공해도 상한인
// 500건까지밖에 못 세서 "500건 이상"으로 나왔다. 실제 값은 32만 건이다.
//
// 다만 이 검색은 완전 정확일치가 아니라 총건수를 그냥 믿으면 안 된다(실측:
// "한빛정밀"은 총 12건이 잡히지만 전부 무관한 출원인이라 실제로는 0건).
// 그래서 뉴스 쪽과 같은 방식으로, 표본을 받아 그 표본이 깨끗한지 보고 판단한다.
//
// 표본 30건이면 삼성전자도 4.8초에 온다(100건은 12.5초). 실측한 회사들은
// LG생활건강·삼성전자·카카오 모두 표본 30건이 30건 다 일치했다.
const SAMPLE_SIZE = 30;

// 표본만 받으므로 예전 8초보다 여유가 있지만, KIPRIS 자체가 느린 날이 있다.
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
  url.searchParams.set("docsStart", "1");
  url.searchParams.set("docsCount", String(SAMPLE_SIZE));
  url.searchParams.set("accessKey", serviceKey);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const normalizedTarget = normalizeCompanyName(searchWord);

    const applicants = [...xml.matchAll(/<Applicant>(.*?)<\/Applicant>/g)];
    const matchingCount = applicants.filter(([, name]) =>
      normalizeCompanyName(name).includes(normalizedTarget),
    ).length;

    const total = Number(
      xml.match(/<TotalSearchCount>(\d+)<\/TotalSearchCount>/)?.[1],
    );

    // 총건수를 못 읽었으면 본 것만 말한다.
    if (!Number.isFinite(total)) {
      return { count: matchingCount, isAtLeast: applicants.length > 0 };
    }

    // 총건수가 표본 이하면 전부 본 것이다. 걸러낸 수가 곧 정답이다.
    // ("한빛정밀": 총 12건을 다 받아 확인 → 전부 무관한 출원인이라 0건)
    if (total <= applicants.length) {
      return { count: matchingCount, isAtLeast: false };
    }

    // 표본이 한 건도 빠짐없이 이 회사면 검색어가 이 회사에서는 깨끗하게
    // 동작한다는 뜻이라 총건수를 그대로 쓴다(실측: LG생활건강 5,282건,
    // 삼성전자 325,636건, 카카오 1,482건 — 셋 다 표본 30/30 일치).
    if (matchingCount === applicants.length) {
      return { count: total, isAtLeast: false };
    }

    // 표본이 섞였는데 전체는 볼 수 없는 경우. 총건수를 그대로 쓰면 부풀린 값을
    // 정확한 수치인 양 내보내게 되니, 확인된 건수만 "이상"으로 표시한다.
    return { count: matchingCount, isAtLeast: matchingCount > 0 };
  } catch {
    return null;
  }
}
