import zlib from "node:zlib";

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
function normalizeCompanyName(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/^(주식회사|㈜|\(주\))/, "")
    .replace(/(주식회사|㈜|\(주\))$/, "")
    .toLowerCase();
}

function extractTag(entry: string, tag: string): string | undefined {
  return entry.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]?.trim();
}

async function buildCorpCodeIndex(
  serviceKey: string,
): Promise<Map<string, string>> {
  const url = new URL(CORP_CODE_URL);
  url.searchParams.set("crtfc_key", serviceKey);

  // 3.6MB 다운로드라 다른 외부 API(5~8초)보다 넉넉하게 잡는다.
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`corpCode 요청 실패: HTTP ${response.status}`);
  }

  const xml = inflateSingleEntryZip(Buffer.from(await response.arrayBuffer()));
  const index = new Map<string, string>();

  for (const [, entry] of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const name = extractTag(entry, "corp_name");
    const code = extractTag(entry, "corp_code");
    if (!name || !code) {
      continue;
    }
    // 동명 법인이 여러 개면 먼저 나온 쪽을 쓴다. 파일이 고유번호 순이라
    // 대체로 오래된(= 상장사일 가능성이 높은) 법인이 앞에 온다.
    const key = normalizeCompanyName(name);
    if (!index.has(key)) {
      index.set(key, code);
    }
  }

  return index;
}

let indexPromise: Promise<Map<string, string>> | null = null;

export async function findCorpCode(
  companyName: string,
): Promise<string | null> {
  const serviceKey = process.env.DART_SEARCH_KEY;
  if (!serviceKey) {
    return null;
  }

  try {
    indexPromise ??= buildCorpCodeIndex(serviceKey);
    const index = await indexPromise;

    // 부분 일치는 일부러 안 한다. "한빛정밀"을 부분 일치로 찾으면 전혀 다른
    // 법인인 "한빛"이 걸리고, 그 회사 공시 건수가 우리 회사 것으로 표시된다.
    // 못 찾으면 null을 돌려주고 호출부가 합성 데이터로 폴백하는 게 낫다.
    return index.get(normalizeCompanyName(companyName)) ?? null;
  } catch {
    // 실패한 프라미스를 그대로 캐시해두면 이후 모든 요청이 같이 죽는다.
    indexPromise = null;
    return null;
  }
}
