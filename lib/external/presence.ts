import { findExternalPresence, type ExternalPresence } from "@/data/visibility";
import { fetchNewsCount } from "@/lib/external/news";
import { fetchJobCount } from "@/lib/external/jobs";
import { fetchPatentCount } from "@/lib/external/patents";

// 세 API를 병렬로 호출하고, 키가 설정된 항목만 실제 값으로 덮어쓴다.
// 키가 없거나 호출이 실패한 항목은 기존 합성 데이터(data/visibility.ts)를 그대로 쓴다.
// 그래서 뉴스 API 키만 먼저 등록해도 뉴스만 실 데이터로 바뀌고 나머지는 안 깨진다.
export async function getExternalPresence(
  companyId: string,
  companyName: string,
): Promise<ExternalPresence> {
  const fallback = findExternalPresence(companyId);

  const [newsCount, jobCount, patentCount] = await Promise.all([
    fetchNewsCount(companyName),
    fetchJobCount(companyName),
    fetchPatentCount(companyName),
  ]);

  return {
    companyId,
    newsCount: newsCount ?? fallback.newsCount,
    jobCount: jobCount ?? fallback.jobCount,
    patentCount: patentCount ?? fallback.patentCount,
  };
}
