import {
  findExternalPresence,
  hasSyntheticPresence,
  type ExternalPresence,
  type ExternalSource,
} from "@/data/visibility";
import { fetchNewsCount } from "@/lib/external/news";
import { fetchEmployment } from "@/lib/external/employment";
import { fetchPatentCount } from "@/lib/external/patents";
import { fetchDisclosureCount } from "@/lib/external/disclosures";
import { fetchDartProfile } from "@/lib/external/dart";

// 네 API를 병렬로 호출하고, 키가 설정된 항목만 실제 값으로 덮어쓴다.
// 키가 없거나 호출이 실패한 항목은 기존 합성 데이터(data/visibility.ts)를 그대로 쓴다.
// 그래서 뉴스 API 키만 먼저 등록해도 뉴스만 실 데이터로 바뀌고 나머지는 안 깨진다.

// 검색으로 고른 실제 기업은 id가 DART 고유번호(8자리)다.
const CORP_CODE = /^\d{8}$/;

// 국민연금 쪽은 사업자등록번호 앞 6자리만 공개한다. 동명 회사를 가르려면
// 전체 번호가 필요한데, 그건 DART 기업개황에만 있다. 여기서 미리 받아 둔다.
async function findBizrNo(companyId: string): Promise<string | undefined> {
  if (!CORP_CODE.test(companyId)) {
    return undefined;
  }

  const profile = await fetchDartProfile(companyId);
  return profile?.bizrNo || undefined;
}

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

  const isDemoCompany = hasSyntheticPresence(companyId);
  const bizrNo = await findBizrNo(companyId);

  const [news, employment, patent, disclosureCount] = await Promise.all([
    fetchNewsCount(companyName),
    fetchEmployment(companyName, bizrNo),
    fetchPatentCount(companyName),
    fetchDisclosureCount(companyName),
  ]);

  // 데모 기업은 합성 데이터가 곧 정답이라 폴백이 정상 동작이다. 검색으로 찾은
  // 실제 기업은 폴백할 값이 없어 0이 되므로, 대답하지 않은 축을 그대로 적어
  // 화면과 진단서가 "0건"이라고 단정하지 않게 한다.
  const unavailable: ExternalSource[] = [];
  if (!isDemoCompany) {
    if (!news) unavailable.push("news");
    if (patent === null) unavailable.push("patent");
    if (!employment) unavailable.push("employment");
    if (disclosureCount === null) unavailable.push("disclosure");
  }

  return {
    companyId,
    unavailable,
    newsCount: news?.count ?? fallback.newsCount,
    newsCountIsAtLeast: news ? news.isAtLeast : undefined,
    employeeCount: employment?.employeeCount ?? fallback.employeeCount,
    employeeChange: employment?.employeeChange,
    employmentAsOf: employment?.asOf,
    patentCount: patent?.count ?? fallback.patentCount,
    patentCountIsAtLeast: patent ? patent.isAtLeast : undefined,
    disclosureCount: disclosureCount ?? fallback.disclosureCount ?? 0,
  };
}
