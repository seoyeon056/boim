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

export async function fetchPatentCount(
  companyName: string,
): Promise<number | null> {
  const serviceKey = process.env.KIPRIS_SERVICE_KEY;

  if (!serviceKey) {
    return null;
  }

  const url = new URL(
    "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch",
  );
  url.searchParams.set("word", companyName);
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
    const normalizedTarget = normalizeCompanyName(companyName);

    const applicants = [...xml.matchAll(/<applicantName>(.*?)<\/applicantName>/g)];
    const matchingCount = applicants.filter(([, name]) =>
      normalizeCompanyName(name).includes(normalizedTarget),
    ).length;

    return matchingCount;
  } catch {
    return null;
  }
}
