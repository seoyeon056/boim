import type { Company } from "@/data/companies";
import type { Visibility } from "@/lib/visibility";
import type { Signals } from "@/lib/signals";
import type { ReviewStats } from "@/lib/llm/review-insight";
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

// LLM이 쓴 종합 진단 문장. 실패 시 화면이 규칙 기반 문장으로 되돌아간다.
export function fetchDiagnosis(companyId?: string) {
  return request<{ diagnosis: string }>(
    withCompany("/api/diagnosis", companyId),
  );
}

// Step 04 검수 안내 문장.
// 추출 결과는 서버에 없고 sessionStorage에만 있어서 집계를 실어 보낸다.
// 보내는 값은 개수뿐이라 거래처명·금액 같은 원본은 서버로 나가지 않는다.
export async function fetchReviewInsight(stats: ReviewStats) {
  const response = await fetch("/api/review-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stats),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API 요청에 실패했습니다. 상태 코드: ${response.status}`);
  }

  return (await response.json()) as { insight: string };
}
