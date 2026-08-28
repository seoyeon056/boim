// DART 기업 목록을 빌드 시점에 한 번만 받아 소스로 구워 둔다.
//
// 예전에는 서버가 요청을 받을 때마다 corpCode.xml(3.6MB zip)을 내려받아 압축을
// 풀고 11만 건을 정규식으로 훑었다. 로컬에서는 모듈 캐시가 살아 있어 한 번만
// 하면 됐지만, 서버리스는 콜드스타트마다 처음부터 다시 한다. 배포본에서 기업
// 검색이 30초가 걸린 이유다.
//
// 결과는 lib/external/dart-index.generated.ts 로 나간다(gitignore 대상).
// 키가 없거나 받기에 실패하면 빈 문자열을 쓰고, 런타임이 예전처럼 직접
// 내려받는 경로로 넘어간다.
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "lib", "external", "dart-index.generated.ts");

// 타입을 string 으로 못박아 둔다. 타입 주석 없이 빈 문자열을 쓰면 리터럴 타입 ""
// 으로 좁혀져서, 값이 비었는지 확인한 뒤 split 을 부르는 쪽이 never 가 된다.
// (키 없이 빌드하는 사람에게만 터져서 놓치기 쉽다.)
const EMPTY_INDEX = `export const DART_CORPS: string = "";
`;

// .env.local 은 Next 가 읽지만 이 스크립트는 직접 읽어야 한다.
async function readLocalEnv() {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // 배포 환경에는 파일이 없다. 환경변수가 이미 들어와 있다.
  }
}

function inflateSingleEntryZip(zip) {
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const dataStart = 30 + nameLength + extraLength;
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const centralDirectory = zip.readUInt32LE(eocd + 16);
  const compressedSize = zip.readUInt32LE(centralDirectory + 20);
  return inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize)).toString("utf8");
}

// 검색은 공백을 지우고 소문자로 맞춰 비교한다. 11만 건을 요청마다 정규화하지
// 않도록 정규화된 이름을 미리 한 칸에 넣어 둔다.
function normalize(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

// 3.6MB 다운로드인데 국내 공공 API라 Vercel 빌드 리전(미국 iad1)에서 느리다.
// 2026-08-28 배포에서 60초 타임아웃에 걸려 인덱스가 빈 채로 구워졌고, 그러면
// 런타임이 콜드스타트마다 이 파일을 직접 받는 원래 상태로 되돌아간다.
// 넉넉히 잡고 한 번 더 시도한다. 그래도 안 되면 호출부가 폴백한다.
const DOWNLOAD_TIMEOUT_MS = 120000;
const DOWNLOAD_ATTEMPTS = 2;

async function downloadCorpCodeZip(key) {
  let lastError;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();

    try {
      const response = await fetch(
        `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`,
        { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) },
      );
      if (!response.ok) {
        throw new Error(`corpCode 요청 실패: HTTP ${response.status}`);
      }

      const zip = Buffer.from(await response.arrayBuffer());
      // 또 실패하면 얼마나 걸려서 실패했는지가 로그에 있어야 판단이 된다.
      console.log(
        `corpCode 내려받기 완료: ${(zip.length / 1e6).toFixed(1)}MB, ${Date.now() - startedAt}ms`,
      );
      return zip;
    } catch (error) {
      lastError = error;
      console.warn(
        `corpCode 내려받기 ${attempt}차 실패(${Date.now() - startedAt}ms): ${error.message}`,
      );
    }
  }

  throw lastError;
}

async function main() {
  await readLocalEnv();
  const key = process.env.DART_SEARCH_KEY;

  if (!key) {
    await writeFile(OUT, EMPTY_INDEX, "utf8");
    console.log("DART 키가 없어 인덱스를 비워 둔다 (런타임이 직접 내려받는다)");
    return;
  }

  const xml = inflateSingleEntryZip(await downloadCorpCodeZip(key));
  const lines = [];

  for (const [, entry] of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const pick = (tag) => entry.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]?.trim() ?? "";
    const name = pick("corp_name");
    const code = pick("corp_code");
    if (!name || !code) continue;
    // 정규화이름 \t 고유번호 \t 원래이름 \t 종목코드
    lines.push(`${normalize(name)}\t${code}\t${name}\t${pick("stock_code")}`);
  }

  const text = lines.join("\n");
  await writeFile(
    OUT,
    `export const DART_CORPS: string = ${JSON.stringify(text)};\n`,
    "utf8",
  );
  console.log(`DART 인덱스 생성 완료: ${lines.length.toLocaleString()}건`);
}

main().catch((error) => {
  // 인덱스가 없어도 런타임이 직접 내려받으므로 빌드를 막지 않는다.
  // 타입을 string 으로 못 박아 두는 게 중요하다. 빈 문자열 리터럴로 두면
  // dart-corp-codes.ts 의 if (!DART_CORPS) 를 지난 뒤 타입이 never 로 좁혀져
  // .split() 에서 타입 체크가 깨진다. 빌드를 막지 않으려던 폴백이 빌드를 막는다.
  console.warn("DART 인덱스 생성 실패 — 런타임 조회로 대체한다:", error.message);
  return writeFile(OUT, EMPTY_INDEX, "utf8");
});
