import type { Company } from "@/data/companies";
import { searchCorps, type DartCorp } from "@/lib/external/dart-corp-codes";

// OPEN DART 기업 조회 — 검색과 기업개황.
// https://opendart.fss.or.kr
//
// 고유번호 목록(corpCode.xml)을 받아 캐시하는 일은 dart-corp-codes.ts 가 맡는다.
// 공시 건수(disclosures.ts)와 같은 다운로드를 공유하므로 여기서 또 받지 않는다.

const COMPANY_URL = "https://opendart.fss.or.kr/api/company.json";

// DART 응답의 법인구분 코드.
const CORP_CLASS_LABEL: Record<string, string> = {
  Y: "유가증권 상장",
  K: "코스닥 상장",
  N: "코넥스 상장",
  E: "비상장",
};

const STATUS_OK = "000";

export type DartProfile = {
  corpCode: string;
  corpName: string;
  ceoName: string;
  bizrNo: string;
  address: string;
  indutyCode: string;
  establishedAt: string;
  corpClass: string;
};

// 검색 결과 카드가 기대하는 모양으로 맞춘다.
// 고유번호 목록에는 지역·업종·직원수가 없다. 기업을 고른 뒤 기업개황으로 채운다.
function toCompany(corp: DartCorp): Company {
  return {
    id: corp.corpCode,
    name: corp.corpName,
    description: corp.stockCode.trim() ? "상장 기업" : "비상장 기업",
    region: "",
    industry: "",
    employees: 0,
  };
}

// 이름에 검색어가 들어간 실제 기업을 찾는다.
// 키가 없거나 호출이 실패하면 null 을 돌려주고, 호출한 쪽이 데모 데이터로 넘어간다.
export async function searchDartCompanies(
  query: string,
  limit = 20,
): Promise<Company[] | null> {
  const corps = await searchCorps(query, limit);

  return corps ? corps.map(toCompany) : null;
}

// 기업개황. 대표자·주소·업종과 사업자등록번호를 준다.
// 사업자등록번호가 여기서 나오므로, 국세청 진위확인을 붙일 때
// 사용자에게 번호를 따로 입력받을 필요가 없다.
export async function fetchDartProfile(
  corpCode: string,
): Promise<DartProfile | null> {
  const serviceKey = process.env.DART_SEARCH_KEY;
  if (!serviceKey) {
    return null;
  }

  const url = new URL(COMPANY_URL);
  url.searchParams.set("crtfc_key", serviceKey);
  url.searchParams.set("corp_code", corpCode);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, string>;
    if (data.status !== STATUS_OK) {
      return null;
    }

    return {
      corpCode,
      corpName: data.corp_name ?? "",
      ceoName: data.ceo_nm ?? "",
      bizrNo: data.bizr_no ?? "",
      address: data.adres ?? "",
      indutyCode: data.induty_code ?? "",
      establishedAt: data.est_dt ?? "",
      corpClass: CORP_CLASS_LABEL[data.corp_cls] ?? data.corp_cls ?? "",
    };
  } catch {
    return null;
  }
}
