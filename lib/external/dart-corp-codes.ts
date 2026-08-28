import zlib from "node:zlib";
import { toKoreanLetterSpelling } from "@/lib/korean";
import { DART_CORPS } from "@/lib/external/dart-index.generated";

// DART 공시 API(list.json)는 회사명으로 바로 조회가 안 되고 8자리 고유번호
// (corp_code)를 요구한다. 그 매핑표는 corpCode.xml 하나로만 제공되는데, 이름과
// 달리 응답이 XML이 아니라 zip 바이너리다(content-type도 application/x-msdownload).
//
// zip 해제 의존성을 새로 추가하는 대신 표준 zlib으로 직접 푼다. 이 파일은 안에
// CORPCODE.xml 항목 하나뿐이고 deflate(method 8)로 압축돼 있어서, 로컬 헤더에서
// 파일명/부가필드 길이만 읽어 데이터 시작 위치를 구하고 inflateRaw 하면 된다.
// 압축 크기는 로컬 헤더 쪽이 0으로 비어 있을 수 있어 중앙 디렉터리에서 읽는다.
//
// 실측 비용(2026-08): 다운로드 0.8초 / 해제 0.07초 / 인덱싱 0.2초, 항목 110,888개에
// heap 20MB. 프로세스당 한 번이면 되는 비용이라 모듈 스코프에 캐시한다.
const CORP_CODE_URL = "https://opendart.fss.or.kr/api/corpCode.xml";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const DEFLATE_METHOD = 8;

function inflateSingleEntryZip(zip: Buffer): string {
  if (zip.length < 30 || zip.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error("corpCode 응답이 zip이 아니다");
  }

  const method = zip.readUInt16LE(8);
  const fileNameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const dataStart = 30 + fileNameLength + extraLength;

  const eocdOffset = zip.lastIndexOf(EOCD_SIGNATURE);
  if (eocdOffset < 0) {
    throw new Error("zip 중앙 디렉터리를 찾지 못했다");
  }
  const centralDirectoryOffset = zip.readUInt32LE(eocdOffset + 16);
  const compressedSize = zip.readUInt32LE(centralDirectoryOffset + 20);

  const body = zip.subarray(dataStart, dataStart + compressedSize);

  // 압축률이 낮은 파일은 zip이 무압축(method 0)으로 저장하기도 한다.
  return method === DEFLATE_METHOD
    ? zlib.inflateRawSync(body).toString("utf8")
    : body.toString("utf8");
}

// DART의 corp_name은 "주식회사 엘지생활건강"처럼 법인격 표기가 붙거나 빠진다.
// 공백과 앞뒤 법인격 표기만 걷어내고 비교한다.
//
// 알파벳은 한글 소리로 바꾼다. DART는 등록된 표기 그대로 저장해서 "LG생활건강",
// "LG이노텍"처럼 알파벳으로 들어 있는데, 사람은 "엘지생활건강"이라고 친다.
// 그대로 비교하면 상장사가 통째로 안 걸리고 이름만 비슷한 재단·SPC가 나온다
// (실측: "엘지생활건강" → 엘지생활건강미래화장품육성재단 1건, 본체 없음).
// 양쪽을 같은 표기로 맞추므로 알파벳으로 쳐도 그대로 걸린다.
function normalizeCompanyName(value: string): string {
  return toKoreanLetterSpelling(value)
    .replace(/\s+/g, "")
    .replace(/^(주식회사|㈜|\(주\))/, "")
    .replace(/(주식회사|㈜|\(주\))$/, "")
    .toLowerCase();
}

function extractTag(entry: string, tag: string): string | undefined {
  return entry.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]?.trim();
}

export type DartCorp = {
  corpCode: string;
  corpName: string;
  stockCode: string;
};

type CorpCodeIndex = {
  // 정확 일치 조회용(공시 건수). 동명 법인은 먼저 나온 쪽을 쓴다.
  byName: Map<string, string>;
  // 고유번호 -> 회사명. 화면이 URL에 고유번호만 들고 다녀서, 고른 기업의
  // 이름을 되찾으려면 반대 방향 조회가 필요하다.
  byCode: Map<string, string>;
  // 부분 일치 검색용(기업 검색 화면).
  all: DartCorp[];
};

async function buildCorpCodeIndex(
  serviceKey: string,
): Promise<CorpCodeIndex> {
  const url = new URL(CORP_CODE_URL);
  url.searchParams.set("crtfc_key", serviceKey);

  // 3.6MB 다운로드라 다른 외부 API(5~8초)보다 넉넉하게 잡는다.
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`corpCode 요청 실패: HTTP ${response.status}`);
  }

  const xml = inflateSingleEntryZip(Buffer.from(await response.arrayBuffer()));
  const byName = new Map<string, string>();
  const byCode = new Map<string, string>();
  const all: DartCorp[] = [];

  for (const [, entry] of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const name = extractTag(entry, "corp_name");
    const code = extractTag(entry, "corp_code");
    if (!name || !code) {
      continue;
    }

    all.push({
      corpCode: code,
      corpName: name,
      stockCode: extractTag(entry, "stock_code") ?? "",
    });

    // 동명 법인이 여러 개면 먼저 나온 쪽을 쓴다. 파일이 고유번호 순이라
    // 대체로 오래된(= 상장사일 가능성이 높은) 법인이 앞에 온다.
    const key = normalizeCompanyName(name);
    if (!byName.has(key)) {
      byName.set(key, code);
    }
    byCode.set(code, name);
  }

  return { byName, byCode, all };
}

// 빌드 때 구워 둔 목록을 먼저 쓴다. 없으면(키 없이 빌드된 경우) 예전처럼 직접
// 내려받는다. 서버리스는 콜드스타트마다 모듈 캐시가 비어서, 매번 3.6MB를 받아
// 11만 건을 파싱하면 배포본에서 검색이 30초씩 걸린다.
function buildIndexFromBaked(): CorpCodeIndex | null {
  if (!DART_CORPS) {
    return null;
  }

  const byName = new Map<string, string>();
  const byCode = new Map<string, string>();
  const all: DartCorp[] = [];

  for (const line of DART_CORPS.split("\n")) {
    // 정규화이름 | 고유번호 | 원래이름 | 종목코드 (탭 구분)
    // 첫 칸은 빌드 스크립트가 만든 것이라 여기 규칙(법인격 표기 제거, 알파벳
    // 한글 표기)을 거치지 않았다. 그대로 열쇠로 쓰면 조회하는 쪽과 어긋나므로
    // 원래 이름에서 다시 정규화한다. 11만 건에 약 150ms(실측), 프로세스당 한 번이다.
    const [, code, name, stockCode] = line.split("\t");
    if (!code || !name) {
      continue;
    }
    all.push({ corpCode: code, corpName: name, stockCode: stockCode ?? "" });
    const key = normalizeCompanyName(name);
    if (!byName.has(key)) {
      byName.set(key, code);
    }
    byCode.set(code, name);
  }

  return { byName, byCode, all };
}

let bakedIndex: CorpCodeIndex | null | undefined;

function getBakedIndex(): CorpCodeIndex | null {
  bakedIndex ??= buildIndexFromBaked();
  return bakedIndex;
}

let indexPromise: Promise<CorpCodeIndex> | null = null;

// 구워 둔 목록이 있으면 네트워크를 아예 타지 않는다.
async function getIndex(): Promise<CorpCodeIndex | null> {
  const baked = getBakedIndex();
  if (baked) {
    return baked;
  }

  // 구워 둔 목록이 없을 때만 직접 내려받고, 그때만 키가 필요하다.
  // 빌드에서만 키를 주고 런타임에 안 주는 배포도 있어서, 키 없음을
  // 먼저 걸러버리면 애써 구워 둔 목록을 쓰지 못한다.
  const serviceKey = process.env.DART_SEARCH_KEY;
  if (!serviceKey) {
    return null;
  }

  indexPromise ??= buildCorpCodeIndex(serviceKey);
  return indexPromise;
}

export async function findCorpCode(
  companyName: string,
): Promise<string | null> {
  try {
    const index = await getIndex();
    if (!index) {
      return null;
    }

    // 부분 일치는 일부러 안 한다. "한빛정밀"을 부분 일치로 찾으면 전혀 다른
    // 법인인 "한빛"이 걸리고, 그 회사 공시 건수가 우리 회사 것으로 표시된다.
    // 못 찾으면 null을 돌려주고 호출부가 합성 데이터로 폴백하는 게 낫다.
    return index.byName.get(normalizeCompanyName(companyName)) ?? null;
  } catch {
    // 실패한 프라미스를 그대로 캐시해두면 이후 모든 요청이 같이 죽는다.
    indexPromise = null;
    return null;
  }
}

// 이름에 검색어가 들어간 기업을 찾는다(기업 검색 화면용).
// findCorpCode 와 달리 부분 일치를 허용한다. 여기서는 사용자가 후보를 눈으로
// 보고 고르기 때문에, 엉뚱한 법인이 섞여도 잘못된 수치로 이어지지 않는다.
export async function searchCorps(
  query: string,
  limit = 20,
): Promise<DartCorp[] | null> {
  const normalizedQuery = normalizeCompanyName(query);
  if (normalizedQuery === "") {
    return [];
  }

  try {
    const index = await getIndex();
    if (!index) {
      return null;
    }

    return index.all
      .filter((corp) =>
        normalizeCompanyName(corp.corpName).includes(normalizedQuery),
      )
      // 상장사를 먼저, 그다음 이름이 짧은(= 검색어에 가까운) 순서로 보여준다.
      .sort((a, b) => {
        const listed =
          Number(Boolean(b.stockCode.trim())) -
          Number(Boolean(a.stockCode.trim()));
        return listed !== 0 ? listed : a.corpName.length - b.corpName.length;
      })
      .slice(0, limit);
  } catch {
    indexPromise = null;
    return null;
  }
}

// 8자리 고유번호로 회사명을 되찾는다.
//
// 검색 결과에서 고른 실제 기업은 id가 DART 고유번호다. 이름을 복원하지 못하면
// 그 기업이 누구인지 알 수 없어, 예전에는 데모 목록의 첫 기업으로 조용히
// 대체됐다(LG생활건강을 골라도 한빛정밀의 뉴스가 표시됐다).
export async function findCorpName(corpCode: string): Promise<string | null> {
  try {
    const index = await getIndex();
    if (!index) {
      return null;
    }

    return index.byCode.get(corpCode) ?? null;
  } catch {
    indexPromise = null;
    return null;
  }
}
