import { findExternalPresence, type ExternalPresence } from "@/data/visibility";
import { fetchNewsCount } from "@/lib/external/news";
import { fetchJobCount } from "@/lib/external/jobs";
import { fetchPatentCount } from "@/lib/external/patents";
import { fetchDisclosureCount } from "@/lib/external/disclosures";

// 네 API를 병렬로 호출하고, 키가 설정된 항목만 실제 값으로 덮어쓴다.
// 키가 없거나 호출이 실패한 항목은 기존 합성 데이터(data/visibility.ts)를 그대로 쓴다.
// 그래서 뉴스 API 키만 먼저 등록해도 뉴스만 실 데이터로 바뀌고 나머지는 안 깨진다.
export async function getExternalPresence(
  companyId: string,
  companyName: string,
): Promise<ExternalPresence> {
  const fallback = findExternalPresence(companyId);

  // 기업명을 못 찾은 경우(고유번호만 있고 DART 조회 실패). 빈 이름으로 외부를
  // 검색하면 엉뚱한 결과가 잡히므로 조회 자체를 건너뛴다.
  if (companyName.trim() === "") {
    return { ...fallback, companyId };
  }

  const [news, jobCount, patent, disclosureCount] = await Promise.all([
    fetchNewsCount(companyName),
    fetchJobCount(companyName),
    fetchPatentCount(companyName),
    fetchDisclosureCount(companyName),
  ]);

  return {
    companyId,
    newsCount: news?.count ?? fallback.newsCount,
    newsCountIsAtLeast: news ? news.isAtLeast : undefined,
    jobCount: jobCount ?? fallback.jobCount,
    patentCount: patent?.count ?? fallback.patentCount,
    patentCountIsAtLeast: patent ? patent.isAtLeast : undefined,
    disclosureCount: disclosureCount ?? fallback.disclosureCount ?? 0,
  };
}
