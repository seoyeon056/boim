// 엔진 데이터 계층.
// API 라우트와 서버 컴포넌트가 같은 함수를 쓰도록 한곳에 모아둔다.
// 서버 컴포넌트는 자기 앱의 API를 HTTP로 다시 부르지 않고 여기서 바로 읽는다.
import { companies, type Company } from "@/data/companies";
import { transactions, type Transaction } from "@/data/transactions";
import { calculateSignals } from "@/lib/signals";
import { calculateVisibility, type Visibility } from "@/lib/visibility";
import { getExternalPresence } from "@/lib/external/presence";
import { searchDartCompanies } from "@/lib/external/dart";
import { findCorpName } from "@/lib/external/dart-corp-codes";

export type { Visibility } from "@/lib/visibility";

// 기업을 지정하지 않고 들어온 경우(직접 URL 진입, 파라미터 없는 API 호출)에는
// 첫 기업을 기준으로 보여준다.
const DEFAULT_COMPANY = companies[0];

// DART 고유번호는 8자리 숫자다. 데모 기업 id("hanbit")와 구분된다.
const CORP_CODE = /^\d{8}$/;

export async function getCompany(companyId?: string): Promise<Company> {
  if (!companyId) {
    return DEFAULT_COMPANY;
  }

  const company = companies.find((item) => item.id === companyId);
  if (company) {
    return company;
  }

  // 검색 결과에서 고른 실제 기업은 id가 DART 고유번호다. 화면은 URL에 번호만
  // 들고 다니므로 여기서 이름을 되찾아야 한다.
  //
  // 예전에는 데모 목록에 없으면 무조건 첫 기업(한빛정밀)을 돌려줬다. 그래서
  // LG생활건강을 골라도 한빛정밀의 뉴스·특허·공시가 그대로 표시됐다.
  // 다른 기업의 데이터를 그 기업의 것인 양 보여주는 건 조용한 오답이라 제일 나쁘다.
  if (CORP_CODE.test(companyId)) {
    const name = await findCorpName(companyId);
    if (name) {
      return {
        id: companyId,
        name,
        description: "",
        region: "",
        industry: "",
        employees: 0,
      };
    }
  }

  // 이름을 못 찾으면 빈 이름으로 돌려준다. 외부 조회를 건너뛰게 하기 위한 신호다.
  return {
    id: companyId,
    name: "",
    description: "",
    region: "",
    industry: "",
    employees: 0,
  };
}

export async function getVisibility(companyId?: string): Promise<Visibility> {
  const company = await getCompany(companyId);
  const presence = await getExternalPresence(company.id, company.name);

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

  return transactionsOf(company.id).slice(0, 5);
}

// 검색어와 기업명을 비교 가능한 형태로 맞춘다.
// 공백을 제거하고 소문자로 바꿔서 "한빛 정밀"과 "한빛정밀", "lg"와 "LG"가 같은 값으로 취급되게 한다.
function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// 입력한 기업명을 포함하는 기업을 모두 반환한다(공백/대소문자 무시).
// DART 인증키가 있으면 실제 기업 목록에서 찾고, 없으면 데모 데이터에서 찾는다.
// 예: "LG"로 검색하면 이름에 LG를 포함하는 기업이 함께 나온다.
export async function findCompaniesByName(query: string): Promise<Company[]> {
  const normalizedQuery = normalizeCompanyName(query.trim());

  if (normalizedQuery === "") {
    return [];
  }

  const fromDemo = companies.filter((item) =>
    normalizeCompanyName(item.name).includes(normalizedQuery),
  );

  // 키가 없거나 DART 호출이 실패하면 null 이 온다.
  const fromDart = await searchDartCompanies(query.trim());

  // 빈 배열(= 조회는 됐지만 결과 없음)도 값이라서, 예전처럼 `if (fromDart)`로
  // 갈라내면 데모 데이터로 영영 못 넘어간다. 그래서 "한빛정밀"처럼 DART에 없는
  // 데모 기업 30곳이 전부 검색되지 않았다.
  //
  // 실제 기업을 먼저 보여주고, 데모 기업은 뒤에 붙인다. 데모 기업만 내부 거래
  // 데이터(data/transactions.ts)를 가지고 있어서 진단 흐름을 끝까지 볼 수 있다.
  return fromDart ? [...fromDart, ...fromDemo] : fromDemo;
}
