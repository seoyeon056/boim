// 국민연금공단 국민연금 가입 사업장 내역 오픈API.
// https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2
//
// 원래 이 축은 사람인 채용공고 건수였다. 채용공고는 "지금 사람을 뽑고 있는가"라
// 회사가 공고를 안 올리기로 하면 그냥 0이 된다. 이 서비스가 다루는 B2B 제조
// 중소기업은 대부분 공개 채용을 안 하므로, 축 하나가 통째로 죽어 있었다.
//
// 국민연금 가입자 수는 회사의 선택이 아니라 의무 신고의 결과라, 홍보를 안 하는
// 회사에도 남는다. 게다가 월 단위로 쌓여서 규모뿐 아니라 증감까지 읽힌다.
//
// 제공 범위는 가입자 3인 이상 법인사업장, 10인 이상 개인사업장(2025.7. 이후)이다.
// 3인 미만 법인은 애초에 데이터에 없다. 그래서 못 찾은 것을 0명으로 적으면
// 안 된다. 찾지 못하면 null 을 돌려주고, 화면은 "확인 불가"로 표시한다.

import { toKoreanLetterSpelling } from "@/lib/korean";

const BASE = "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2";

// 명세는 스네이크 케이스로 적혀 있지만 실제로 먹는 이름은 카멜 케이스다.
// wkpl_nm 으로 보내면 오류가 아니라 조용히 무시되고 0건이 온다.
const SEARCH = "getBassInfoSearchV2";
const DETAIL = "getDetailInfoSearchV2";

// 한 사업장이 12개월치 행을 가진다. 동명 회사가 여럿이면 그 배수가 되므로
// 첫 페이지를 넉넉히 받는다.
const PAGE_SIZE = 100;

// 증감을 재는 창. 국민연금 자료는 월 단위라 6개월이면 계절 요인을 어느 정도 넘긴다.
const CHANGE_WINDOW_MONTHS = 6;

// 사업장명 검색은 페이지 크기와 무관하게 9초 안팎이 걸린다(실측: numOfRows를
// 24로 줄여도 같다). 상세 조회는 60ms 대라 따로 짧게 잡는다.
//
// 12초로 뒀더니 여유가 3초뿐이라 같은 기업을 연달아 조회할 때 절반쯤 타임아웃했다.
// 그때마다 고용 축이 "확인 불가"가 되면서 가시성 점수가 25점과 30점을 오갔다.
// 라우트에 maxDuration 30 을 걸어 두었으므로 20초까지는 안전하다.
const SEARCH_TIMEOUT_MS = 20000;
const DETAIL_TIMEOUT_MS = 4000;

export type Employment = {
  // 최근 자료생성년월 기준 가입자 수. 같은 사업자번호의 사업장이 여럿이면 합산한다.
  employeeCount: number;
  // 6개월 전 대비 증감(명). 비교할 과거 자료가 없으면 undefined.
  employeeChange?: number;
  // 최근 자료생성년월(YYYYMM). 화면에 기준 시점을 적기 위해 들고 다닌다.
  asOf: string;
};

type Row = {
  seq: string;
  dataCrtYm: string;
  bizrPrefix: string;
  workplaceName: string;
};

// (주)·주식회사·공백 같은 표기 차이를 지운다. 국민연금 쪽은 "(주)동일기연",
// DART 쪽은 "동일기연"으로 오는 식이라 그대로 비교하면 하나도 안 맞는다.
function normalize(name: string): string {
  return name
    .replace(/주식회사|유한회사|유한책임회사|합자회사|합명회사/g, "")
    .replace(/\((?:주|유|재|사)\)|[㈜㈔㈖]/g, "")
    .replace(/[\s·.,\-_'"]/g, "")
    .toLowerCase();
}

function tagText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : "";
}

function itemBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

async function call(
  operation: string,
  params: Record<string, string>,
  timeoutMs: number,
): Promise<string | null> {
  const serviceKey = process.env.KOOKMIN_API_KEY;
  if (!serviceKey) {
    return null;
  }

  const url = new URL(`${BASE}/${operation}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }

    const body = await response.text();
    // HTTP 200 으로 오면서 본문에만 오류가 담기는 경우가 있다.
    return tagText(body, "resultCode") === "00" ? body : null;
  } catch {
    return null;
  }
}

// 사업자등록번호는 앞 6자리만 공개된다("142816****"). 뒤 4자리를 가리므로
// 완전일치 키로는 못 쓰지만, 같은 이름의 다른 회사를 가르는 데는 충분하다.
function bizrPrefix(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

// 최근 자료생성년월 기준으로 몇 달 뺀 값. "202601"에서 6을 빼면 "202507".
function shiftMonth(ym: string, back: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(4, 6));
  const total = year * 12 + (month - 1) - back;
  return `${Math.floor(total / 12)}${String((total % 12) + 1).padStart(2, "0")}`;
}

// 같은 사업자번호에 사업장이 여럿일 수 있다(본사·공장). 그 달의 가입자 수를
// 모두 더해야 회사 전체 고용 규모가 된다.
async function headcountAt(rows: Row[], ym: string): Promise<number | null> {
  const target = rows.filter((row) => row.dataCrtYm === ym);
  if (target.length === 0) {
    return null;
  }

  const details = await Promise.all(
    target.map((row) =>
      call(DETAIL, { seq: row.seq, numOfRows: "1" }, DETAIL_TIMEOUT_MS),
    ),
  );

  let sum = 0;
  for (const body of details) {
    // 한 사업장이라도 못 읽으면 합계가 실제보다 작아진다. 그 값을 "고용 감소"로
    // 읽으면 없는 사실을 만들어내는 셈이라, 차라리 판단을 포기한다.
    if (!body) {
      return null;
    }
    const count = Number(tagText(body, "jnngpCnt"));
    if (!Number.isFinite(count)) {
      return null;
    }
    sum += count;
  }

  return sum;
}

/**
 * 회사명(과 있으면 사업자등록번호)으로 국민연금 가입 사업장을 찾아
 * 최근 고용 규모와 6개월 증감을 돌려준다.
 *
 * 찾지 못했거나, 동명 회사가 둘 이상이라 어느 쪽인지 가릴 수 없으면 null 이다.
 * 아무거나 고르면 다른 회사의 고용 규모를 이 회사 것인 양 보여주게 된다.
 */
export async function fetchEmployment(
  companyName: string,
  bizrNo?: string,
): Promise<Employment | null> {
  const name = companyName.trim();
  if (name === "") {
    return null;
  }

  // 사업장명은 한글로 등록된다("LG생활건강" → "(주)엘지생활건강"). 특허 쪽에서
  // 쓰는 것과 같은 변환이다. 어느 쪽으로 등록돼 있는지는 회사마다 달라서 두 이름을
  // 나란히 조회한다. 검색 호출이 9초쯤 걸리는데 병렬이라 벽시계 시간은 그대로다.
  const spelled = toKoreanLetterSpelling(name);
  const searchNames = spelled === name ? [name] : [name, spelled];

  const listings = await Promise.all(
    searchNames.map((word) =>
      call(
        SEARCH,
        { wkplNm: word, numOfRows: String(PAGE_SIZE) },
        SEARCH_TIMEOUT_MS,
      ),
    ),
  );

  // 둘 다 실패했을 때만 포기한다. 하나라도 대답했으면 그걸로 판단한다.
  if (listings.every((body) => body === null)) {
    return null;
  }

  const wanted = new Set(searchNames.map(normalize));
  const rows: Row[] = listings
    .filter((body): body is string => body !== null)
    .flatMap(itemBlocks)
    .map((block) => ({
      seq: tagText(block, "seq"),
      dataCrtYm: tagText(block, "dataCrtYm"),
      bizrPrefix: bizrPrefix(tagText(block, "bzowrRgstNo")),
      workplaceName: tagText(block, "wkplNm"),
    }))
    // wkplNm 은 부분일치 검색이라 "삼성전자"에 협력사 현장명까지 딸려 온다
    // ("(주)부일건화-(일용)삼성전자 고창 CDC 물류센터"). 이름이 정확히 같은
    // 사업장만 남긴다.
    .filter(
      (row) => row.seq !== "" && wanted.has(normalize(row.workplaceName)),
    );

  if (rows.length === 0) {
    return null;
  }

  // 두 이름으로 조회했으면 같은 사업장이 두 번 들어올 수 있다. seq 로 접는다.
  const unique = [...new Map(rows.map((row) => [row.seq, row])).values()];

  // 이름이 같은 별개 회사가 실제로 있다(반도체 소자를 만드는 동일기연과
  // 난방보일러를 만드는 동일기연). DART가 준 사업자등록번호로 가른다.
  const prefixes = [...new Set(unique.map((row) => row.bizrPrefix))];
  const wantedPrefix = bizrPrefix(bizrNo ?? "");
  const owned =
    wantedPrefix !== ""
      ? unique.filter((row) => row.bizrPrefix === wantedPrefix)
      : unique;

  if (owned.length === 0) {
    return null;
  }

  // 번호를 못 받았는데 후보가 여럿이면 여기서 멈춘다.
  if (wantedPrefix === "" && prefixes.length > 1) {
    return null;
  }

  const months = [...new Set(owned.map((row) => row.dataCrtYm))].sort();
  const latest = months[months.length - 1];

  const employeeCount = await headcountAt(owned, latest);
  if (employeeCount === null) {
    return null;
  }

  const past = await headcountAt(owned, shiftMonth(latest, CHANGE_WINDOW_MONTHS));

  return {
    employeeCount,
    employeeChange: past === null ? undefined : employeeCount - past,
    asOf: latest,
  };
}
