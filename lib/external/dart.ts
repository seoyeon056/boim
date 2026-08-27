import type { Company } from "@/data/companies";

// OPEN DART (전자공시시스템) 기업 조회.
// https://opendart.fss.or.kr
//
// 두 가지를 쓴다. 인증키는 하나로 공용이다.
//  1) corpCode.xml  — 전체 기업 목록(ZIP). 이름 검색에 쓴다.
//  2) company.json  — 기업개황. 대표자·주소·업종·사업자등록번호를 준다.
//
// 목록은 수만 건이라 매 검색마다 내려받으면 느리다. 서버 메모리에 한 번만
// 올려두고 재사용한다. (서버리스에서 인스턴스가 새로 뜨면 다시 받는다.)

const CORP_CODE_URL = "https://opendart.fss.or.kr/api/corpCode.xml";
const COMPANY_URL = "https://opendart.fss.or.kr/api/company.json";

// 법인구분 코드 → 사람이 읽는 말.
const CORP_CLASS_LABEL: Record<string, string> = {
  Y: "유가증권상장",
  K: "코스닥상장",
  N: "코넥스상장",
  E: "비상장",
};

export type DartCorp = {
  corpCode: string;
  corpName: string;
  stockCode: string;
};

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

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// ── 전체 기업 목록 ──────────────────────────────────────────────

let corpListPromise: Promise<DartCorp[]> | null = null;

async function downloadCorpList(apiKey: string): Promise<DartCorp[]> {
  const url = new URL(CORP_CODE_URL);
  url.searchParams.set("crtfc_key", apiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`DART corpCode ${response.status}`);
  }

  // 응답은 XML 하나가 든 ZIP이다. 압축을 직접 풀어야 한다.
  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = await unzipSingleFile(buffer);

  const corps: DartCorp[] = [];
  for (const [, block] of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const corpCode = block.match(/<corp_code>(.*?)<\/corp_code>/)?.[1]?.trim();
    const corpName = block.match(/<corp_name>(.*?)<\/corp_name>/)?.[1]?.trim();
    if (!corpCode || !corpName) continue;

    corps.push({
      corpCode,
      corpName,
      stockCode:
        block.match(/<stock_code>(.*?)<\/stock_code>/)?.[1]?.trim() ?? "",
    });
  }

  return corps;
}

// ZIP 안에 파일이 하나뿐이라 중앙 디렉터리를 훑지 않고 로컬 헤더만 읽는다.
async function unzipSingleFile(buffer: Buffer): Promise<string> {
  const { inflateRawSync } = await import("node:zlib");

  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  const dataStart = 30 + nameLength + extraLength;
  const method = buffer.readUInt16LE(8);

  const body = buffer.subarray(dataStart);
  const raw = method === 0 ? body : inflateRawSync(body);

  return raw.toString("utf8");
}

async function getCorpList(apiKey: string): Promise<DartCorp[]> {
  corpListPromise ??= downloadCorpList(apiKey).catch((error) => {
    // 실패한 약속을 캐시에 남기면 영영 재시도하지 않는다.
    corpListPromise = null;
    throw error;
  });

  return corpListPromise;
}

// ── 검색 ───────────────────────────────────────────────────────

// 이름에 검색어를 포함하는 기업을 찾는다. 키가 없으면 null 을 돌려주고,
// 호출한 쪽이 기존 합성 데이터로 넘어간다.
export async function searchDartCompanies(
  query: string,
  limit = 20,
): Promise<Company[] | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return null;

  const normalizedQuery = normalize(query);
  if (normalizedQuery === "") return [];

  try {
    const corps = await getCorpList(apiKey);

    const matches = corps
      .filter((corp) => normalize(corp.corpName).includes(normalizedQuery))
      // 이름이 짧을수록(=검색어에 가까울수록) 위로, 상장사를 먼저 보여준다.
      .sort((a, b) => {
        const listed = Number(Boolean(b.stockCode)) - Number(Boolean(a.stockCode));
        return listed !== 0 ? listed : a.corpName.length - b.corpName.length;
      })
      .slice(0, limit);

    return matches.map(toCompany);
  } catch {
    return null;
  }
}

// 검색 결과 카드가 기대하는 모양으로 맞춘다.
// DART 목록에는 업종·지역·직원수가 없어서, 선택 후 기업개황으로 채운다.
function toCompany(corp: DartCorp): Company {
  return {
    id: corp.corpCode,
    name: corp.corpName,
    description: corp.stockCode ? "상장 기업" : "비상장 기업",
    region: "",
    industry: "",
    employees: 0,
  };
}

// ── 기업개황 ────────────────────────────────────────────────────

export async function fetchDartProfile(
  corpCode: string,
): Promise<DartProfile | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return null;

  const url = new URL(COMPANY_URL);
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", corpCode);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, string>;
    if (data.status !== "000") return null;

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
