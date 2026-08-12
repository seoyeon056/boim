export type CompanyResult = {
  id: string;
  name: string;
  description: string;
  region: string;
  industry: string;
  employees: number;
};

export type VisibilityResult = {
  company: string;
  newsCount: number;
  patentCount: number;
  jobCount: number;
  visibilityScore: number;
};

export type SignalResult = {
  customerCount: number;
  previousCustomersCount: number;
  customerGrowthRate: number;
  repeatPurchaseRate: number;
  topCustomerConcentration: number;
  topCustomerName: string;
};

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL;

function getEngineUrl(): string {
  if (!ENGINE_URL) {
    throw new Error("NEXT_PUBLIC_ENGINE_URL이 설정되지 않았습니다.");
  }

  return ENGINE_URL;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${getEngineUrl()}${path}`, {
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

  return request<CompanyResult[]>(
    `/api/companies?q=${encodedQuery}`,
  );
}

export function getVisibility() {
  return request<VisibilityResult>("/api/visibility");
}

export function getSignals() {
  return request<SignalResult>("/api/signals");
}