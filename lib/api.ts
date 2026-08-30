import type { Company } from "@/data/companies";
import type { Visibility } from "@/lib/visibility";
import type { Signals } from "@/lib/signals";
import { withCompany } from "@/lib/company-link";

export type CompanyResult = Company;
export type VisibilityResult = Visibility;
export type SignalsResult = Signals;

// 클라이언트 컴포넌트에서 쓰는 API 클라이언트.
// 페이지와 API가 같은 앱에서 서빙되므로 상대 경로로 호출한다.
// 서버 컴포넌트는 이 파일 대신 lib/engine.ts 를 직접 쓴다.
async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API 요청에 실패했습니다. 상태 코드: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function searchCompanies(query: string) {
  const normalizedQuery = query.trim();

  if (normalizedQuery === "") {
    return Promise.resolve<CompanyResult[]>([]);
  }

  const encodedQuery = encodeURIComponent(normalizedQuery);

  return request<CompanyResult[]>(`/api/companies?q=${encodedQuery}`);
}

export function fetchVisibility(companyId?: string) {
  return request<VisibilityResult>(withCompany("/api/visibility", companyId));
}

export function fetchSignals(companyId?: string) {
  return request<SignalsResult>(withCompany("/api/signals", companyId));
}

// LLM이 쓴 종합 진단 문장.
//
// 화면이 실제로 표시 중인 수치를 그대로 보낸다. 예전에는 companyId만 보내고 서버가
// 합성 데이터로 다시 계산해서, 리포트 표와 종합 의견의 숫자가 서로 달랐다.
// 기업명도 담지 않는다. 비율 숫자만으로는 익명 통계지만, 실명과 묶이면 그 회사의
// 재무 프로필이 된다("㈜한빛정밀 + 최대 거래처 의존도 95.4%"). 거래처 의존도는
// 경쟁사가 알고 싶어 하는 영업 정보라 특히 그렇다.
// 거래처명도 담지 않는다 — 응답의 마스킹 라벨을 화면에서 실명으로 되돌린다.
export type DiagnosisInput = {
  period: string;
  transactionCount: number;
  visibilityScore: number;
  visibilityInterpretation: string;
  newsCount: number;
  // 화면이 "300건 이상"으로 적는 값을 프롬프트만 "300건"으로 보내면, LLM이
  // 하한을 확정 수치처럼 문장에 쓴다.
  newsCountIsAtLeast?: boolean;
  patentCount: number;
  patentCountIsAtLeast?: boolean;
  jobCount: number;
  disclosureCount: number;
  // 외부 서비스가 대답하지 않아 확인하지 못한 축. 건수는 0으로 채워져 있지만
  // "없다"는 뜻이 아니므로 그대로 보내면 LLM이 "채용 공고가 없어"라고 쓴다.
  unavailable: string[];
  customerGrowthRate: number;
  previousCustomersCount: number;
  recentCustomersCount: number;
  growthStatus: string;
  repeatPurchaseRate: number;
  repeatStatus: string;
  topCustomerConcentration: number;
  concentrationStatus: string;
};

export async function fetchDiagnosis(input: DiagnosisInput) {
  const response = await fetch("/api/diagnosis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API 요청에 실패했습니다. 상태 코드: ${response.status}`);
  }

  return (await response.json()) as { diagnosis: string };
}
