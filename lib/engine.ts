// 엔진 데이터 계층.
// API 라우트와 서버 컴포넌트가 같은 함수를 쓰도록 한곳에 모아둔다.
// 서버 컴포넌트는 자기 앱의 API를 HTTP로 다시 부르지 않고 여기서 바로 읽는다.
import { companies, type Company } from "@/data/companies";
import { transactions, type Transaction } from "@/data/transactions";
import { findExternalPresence } from "@/data/visibility";
import { calculateSignals } from "@/lib/signals";
import { calculateVisibility, type Visibility } from "@/lib/visibility";

export type { Visibility } from "@/lib/visibility";

// 기업을 지정하지 않고 들어온 경우(직접 URL 진입, 파라미터 없는 API 호출)에는
// 첫 기업을 기준으로 보여준다.
const DEFAULT_COMPANY = companies[0];

export async function getCompany(companyId?: string): Promise<Company> {
  if (!companyId) {
    return DEFAULT_COMPANY;
  }

  const company = companies.find((item) => item.id === companyId);

  return company ?? DEFAULT_COMPANY;
}

export async function getVisibility(companyId?: string): Promise<Visibility> {
  const company = await getCompany(companyId);
  const presence = findExternalPresence(company.id);

  return calculateVisibility(company.name, presence);
}

// 기업의 내부 거래만 골라낸다. 거래가 없으면 첫 기업 것으로 대신한다.
function transactionsOf(companyId: string): Transaction[] {
  const owned = transactions.filter((item) => item.companyId === companyId);

  return owned.length > 0
    ? owned
    : transactions.filter((item) => item.companyId === DEFAULT_COMPANY.id);
}

export async function getSignals(companyId?: string) {
  const company = await getCompany(companyId);

  return calculateSignals(transactionsOf(company.id));
}

// STEP 4(분석 결과 확인)에서 사용자가 검토할 표본.
// 실제 거래에서 뽑아 와야 기업을 바꿨을 때 다른 기업 거래처가 보이지 않는다.
export async function getReviewSample(companyId?: string) {
  const company = await getCompany(companyId);

  return transactionsOf(company.id).slice(0, 2);
}

// 검색어와 기업명을 비교 가능한 형태로 맞춘다.
// 공백을 제거하고 소문자로 바꿔서 "한빛 정밀"과 "한빛정밀", "lg"와 "LG"가 같은 값으로 취급되게 한다.
function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// 입력한 기업명을 포함하는 기업을 모두 반환한다(공백/대소문자 무시).
// 예: "LG"로 검색하면 "LG생활건강", "LG CNS"처럼 이름에 LG를 포함하는 계열사가 함께 나온다.
export async function findCompaniesByName(query: string): Promise<Company[]> {
  const normalizedQuery = normalizeCompanyName(query.trim());

  if (normalizedQuery === "") {
    return [];
  }

  return companies.filter((item) =>
    normalizeCompanyName(item.name).includes(normalizedQuery),
  );
}
