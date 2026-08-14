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

// 한 번에 돌려줄 검색 결과의 최대 개수.
// "테크"처럼 짧은 조각으로 검색하면 계열사가 여러 개 걸리므로 상한을 둔다.
const MAX_SEARCH_RESULTS = 20;

// 검색 비교용 정규화.
// 공백을 모두 지우기 때문에 "한빛 정밀"로 쳐도 "한빛정밀"을 찾는다.
function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

// 입력한 조각이 기업명 어디에 걸렸는지에 따라 순위를 매긴다.
// 낮을수록 먼저 보여준다: 완전 일치 → 앞부분 일치 → 중간 일치.
// ("lg"로 치면 LG생활건강·LG CNS 처럼 계열사가 함께 나오되,
//  이름이 정확히 "LG"인 곳이 있으면 그곳이 맨 위에 온다.)
function matchRank(companyName: string, normalizedQuery: string): number {
  const normalizedName = normalizeForSearch(companyName);

  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;

  return -1; // 걸리지 않음
}

// 입력한 조각을 이름에 포함하는 기업을 관련도 순으로 반환한다.
export async function findCompaniesByName(query: string): Promise<Company[]> {
  const normalizedQuery = normalizeForSearch(query);

  if (normalizedQuery === "") {
    return [];
  }

  return companies
    .map((company) => ({
      company,
      rank: matchRank(company.name, normalizedQuery),
    }))
    .filter((entry) => entry.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank || a.company.name.localeCompare(b.company.name, "ko"),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map((entry) => entry.company);
}
