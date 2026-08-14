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
