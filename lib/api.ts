import type { Company } from "@/data/companies";

export type CompanyResult = Company;

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
