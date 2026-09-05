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

// 조회 결과. "못 찾았다"와 "부르지 못했다"는 다른 상태다.
//
// 예전에는 둘 다 null 이라, 국민연금이 시간 초과로 대답하지 않은 경우에도
// 화면이 "국민연금 가입 사업장에서 찾지 못함"이라고 적었다. 조회를 못 한 것을
// 조회해 봤더니 없더라고 말한 셈이다. 사유를 함께 돌려준다.
export type EmploymentLookup =
  // 조회에 성공했고 값이 있다.
  | { status: "ok"; value: Employment }
  // 조회는 됐는데 해당 사업장이 없거나(3인 미만 등) 동명 회사를 가리지 못했다.
  | { status: "not-found" }
  // 호출 자체가 실패했다(시간 초과·오류). 값이 없다는 뜻이 아니다.
  | { status: "failed" };

export type Employment = {
  // 최근 자료생성년월 기준 가입자 수. 사업장이 여럿이면 합산한다.
  employeeCount: number;
  // 사업장이 한 페이지를 넘어 일부만 더한 값이면 true. 그때 화면은 "N명 이상"
  // 이라고 적는다. 특허 300건 이상과 같은 취급이다.
  employeeCountIsAtLeast?: boolean;
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
  // 이름이 회사명과 똑같은 사업장인지, 뒤에 부문·현장이 붙은 사업장인지.
  match: "exact" | "division";
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

// 이 사업장이 이 회사의 것인지 본다.
//
// 국민연금은 법인이 아니라 사업장 단위로 등록된다. 그래서 큰 회사는 이름이
// 회사명과 정확히 같은 행이 아예 없고, 부문과 현장으로만 흩어져 있다.
// 실측(삼성물산 435건): 정확히 같은 이름 0건. 대신 이런 것들이 있다.
//
//   삼성물산(주) 패션부문                     ← 이 회사다
//   삼성물산(주)건설부문 정규직                ← 이 회사다
//   삼성물산(주)/일용/삼성서울병원 리모델링     ← 이 회사의 현장이다
//   삼성물산강동어린이집                       ← 다른 사업장이다(번호도 다르다)
//   (주)장원조경/일용/삼성물산_반포아파트...    ← 남의 회사 현장이다
//
// 그래서 두 가지만 본다. 회사명이 사업장명의 맨 앞에 오는가, 그리고 그 뒤가
// 글자·숫자가 아닌가. 뒤에 글자가 바로 이어지면 다른 이름이다(강동어린이집).
// 이름이 중간에 있으면 남의 현장이다(장원조경).
const CORPORATE_FORM = /^(?:주식회사|유한회사|유한책임회사|합자회사|합명회사|\((?:주|유|재|사)\)|[㈜㈔㈖])/;

// 앞에 붙은 법인 형태 표기를 지운다. "(주)엘지생활건강" → "엘지생활건강".
function withoutLeadingForm(name: string): string {
  return name.replace(/\s/g, "").replace(CORPORATE_FORM, "");
}

function matchKind(
  workplaceName: string,
  wantedNames: Set<string>,
  wantedRaw: string[],
): "exact" | "division" | null {
  if (wantedNames.has(normalize(workplaceName))) {
    return "exact";
  }

  const bare = withoutLeadingForm(workplaceName);
  for (const wanted of wantedRaw) {
    const head = withoutLeadingForm(wanted);
    if (head === "" || !bare.startsWith(head)) {
      continue;
    }
    const next = bare.slice(head.length);
    // 회사명이 전부인데 normalize 로 안 걸렸다면 표기 차이일 뿐이다.
    if (next === "") {
      return "exact";
    }
    // 뒤에 글자나 숫자가 바로 이어지면 다른 이름이다.
    if (!/^[\p{L}\p{N}]/u.test(next)) {
      return "division";
    }
  }

  return null;
}

function tagText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : "";
}

function itemBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

// "아직 안 왔다"를 나타내는 표식. null 은 이미 "못 받았다"는 뜻으로 쓰고 있다.
const SLOW = Symbol("slow");

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

// 여러 요청 중 값을 먼저 주는 것 하나. 전부 실패하면 null.
function firstAnswer(
  attempts: Promise<string | null>[],
): Promise<string | null> {
  return new Promise((resolve) => {
    let remaining = attempts.length;
    let done = false;

    for (const attempt of attempts) {
      attempt.then(
        (value) => {
          if (done) return;
          if (value !== null) {
            done = true;
            resolve(value);
          } else if (--remaining === 0) {
            done = true;
            resolve(null);
          }
        },
        () => {
          if (done) return;
          if (--remaining === 0) {
            done = true;
            resolve(null);
          }
        },
      );
    }
  });
}

// 같은 검색을 한 번 더 띄우기까지 기다리는 시간.
//
// 국민연금 검색은 오류를 내지 않는다. 실측 10회 모두 200/정상코드였고, 다만
// 7.4초에 오기도 하고 16.0초가 걸리기도 했다(중앙값 9.7초). 실패한 뒤에 다시
// 부르는 방식은 이 경우 도움이 안 된다. 실패를 확인하려면 제한 시간까지
// 기다려야 하고, 그러고 나서 다시 부르면 총 대기가 두 배가 된다.
//
// 그래서 첫 요청을 취소하지 않고, 이 시간 안에 답이 없으면 한 번 더 띄워
// 먼저 오는 쪽을 쓴다. 늦은 요청이 끝내 답하지 않아도 두 번째가 대신 답한다.
// 중앙값보다 조금 뒤에 두어, 보통은 두 번째 요청 자체가 나가지 않는다.
const RETRY_AFTER_MS = 11000;

// 첫 요청이 늦으면 한 번 더 띄우고, 먼저 오는 답을 쓴다.
async function callTwiceIfSlow(
  operation: string,
  params: Record<string, string>,
  timeoutMs: number,
  retryAfterMs: number = RETRY_AFTER_MS,
): Promise<string | null> {
  const first = call(operation, params, timeoutMs);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<typeof SLOW>((resolve) => {
    timer = setTimeout(() => resolve(SLOW), retryAfterMs);
  });

  try {
    const early = await Promise.race([first, slow]);
    if (early !== SLOW) {
      return early;
    }
    return await firstAnswer([first, call(operation, params, timeoutMs)]);
  } finally {
    // 서버리스 환경에서 남은 타이머가 함수 종료를 늦추지 않도록 정리한다.
    clearTimeout(timer);
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

// 상세 조회를 한 번에 몇 개까지 띄울지.
//
// 사업장이 많은 회사는 이 조회가 수십 개가 된다(실측: 삼성물산 최근 월 기준
// 30곳 남짓). 전부 한꺼번에 던지면 공공데이터포털 쪽에서 일부가 늦어지고,
// 하나만 늦어도 합계를 포기하게 되어 고용 축이 통째로 "확인 불가"가 됐다.
// 실측: 삼성물산 15.3초 뒤 확인 불가, 다른 기업은 모두 정상.
const DETAIL_BATCH = 6;

// 상세 조회는 60ms 대로 끝난다. 검색과 달리 문턱을 짧게 둬야 의미가 있다.
const DETAIL_RETRY_AFTER_MS = 1200;

// 같은 사업자번호에 사업장이 여럿일 수 있다(본사·공장·부문). 그 달의 가입자
// 수를 모두 더해야 회사 전체 고용 규모가 된다.
async function headcountAt(rows: Row[], ym: string): Promise<number | null> {
  const target = rows.filter((row) => row.dataCrtYm === ym);
  if (target.length === 0) {
    return null;
  }

  const details: (string | null)[] = [];
  for (let at = 0; at < target.length; at += DETAIL_BATCH) {
    const batch = await Promise.all(
      target.slice(at, at + DETAIL_BATCH).map((row) =>
        callTwiceIfSlow(
          DETAIL,
          { seq: row.seq, numOfRows: "1" },
          DETAIL_TIMEOUT_MS,
          DETAIL_RETRY_AFTER_MS,
        ),
      ),
    );
    details.push(...batch);
  }

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
): Promise<EmploymentLookup> {
  const name = companyName.trim();
  if (name === "") {
    return { status: "not-found" };
  }

  // 사업장명은 한글로 등록된다("LG생활건강" → "(주)엘지생활건강"). 특허 쪽에서
  // 쓰는 것과 같은 변환이다. 어느 쪽으로 등록돼 있는지는 회사마다 달라서 두 이름을
  // 나란히 조회한다. 검색 호출이 9초쯤 걸리는데 병렬이라 벽시계 시간은 그대로다.
  const spelled = toKoreanLetterSpelling(name);
  const searchNames = spelled === name ? [name] : [name, spelled];

  // 사업자등록번호를 함께 넘기면 조회가 완전히 달라진다.
  //
  // wkplNm 은 부분 일치라, 이름이 널리 쓰이는 회사일수록 협력사 현장명이
  // 먼저 잡힌다. "삼성전자"로 찾으면 2,107건이 걸리고 첫 100건이 전부
  // "주식회사 유일이엔지/상용/평택 삼성전자 P4 Hook up" 같은 공사 현장이라,
  // 정작 삼성전자(주)는 뒤로 밀려 이름이 정확히 같은 사업장을 하나도 못 찾았다.
  // 그래서 고용 축이 늘 "확인 불가"였다.
  //
  // 번호를 같이 넘기면 그 회사의 사업장만 남아 첫 페이지 안에 들어온다.
  // 게다가 훨씬 빠르다(실측: 삼성전자 14,246ms → 144ms, 동일기연 8,762ms → 586ms,
  // 이름이 일치하는 사업장 수는 같거나 더 많다). 전체 번호(10자리)로는 0건이
  // 나오므로 공개되는 앞 6자리를 쓴다.
  const wantedPrefix = bizrPrefix(bizrNo ?? "");
  const wanted = new Set(searchNames.map(normalize));

  const searchParams = (word: string, prefix: string): Record<string, string> => {
    const params: Record<string, string> = {
      wkplNm: word,
      numOfRows: String(PAGE_SIZE),
    };
    if (prefix !== "") {
      params.bzowrRgstNo = prefix;
    }
    return params;
  };

  // 한 번 조회해서 이 회사의 사업장만 남긴다.
  // 전부 실패하면 null (못 찾은 것과 구분해야 한다).
  async function lookUp(
    prefix: string,
  ): Promise<{ rows: Row[]; truncated: boolean } | null> {
    const listings = await Promise.all(
      searchNames.map((word) =>
        callTwiceIfSlow(SEARCH, searchParams(word, prefix), SEARCH_TIMEOUT_MS),
      ),
    );

    // 둘 다 실패했을 때만 포기한다. 하나라도 대답했으면 그걸로 판단한다.
    if (listings.every((body) => body === null)) {
      return null;
    }

    const bodies = listings.filter((body): body is string => body !== null);

    // 한 페이지만 받는다. 사업장이 그보다 많으면 합계가 실제보다 작으므로
    // "이상"을 붙여 내보낸다(실측: 삼성물산 435건).
    const truncated = bodies.some((body) => {
      const total = Number(tagText(body, "totalCount"));
      return Number.isFinite(total) && total > PAGE_SIZE;
    });

    const rows = bodies
      .flatMap(itemBlocks)
      .map((block) => {
        const workplaceName = tagText(block, "wkplNm");
        return {
          seq: tagText(block, "seq"),
          dataCrtYm: tagText(block, "dataCrtYm"),
          bizrPrefix: bizrPrefix(tagText(block, "bzowrRgstNo")),
          workplaceName,
          match: matchKind(workplaceName, wanted, searchNames),
        };
      })
      // wkplNm 은 부분일치 검색이라 "삼성전자"에 협력사 현장명까지 딸려 온다
      // ("(주)부일건화-(일용)삼성전자 고창 CDC 물류센터"). 남의 현장을 뺀다.
      .filter(
        (row): row is Row => row.seq !== "" && row.match !== null,
      );

    return { rows, truncated };
  }

  let found = await lookUp(wantedPrefix);
  if (found === null) {
    return { status: "failed" };
  }
  let rows = found.rows;

  // 번호로 좁혀서 찾았는지, 번호를 놓고 찾았는지. 아래 소유 판정이 이걸 본다.
  let effectivePrefix = wantedPrefix;

  // 번호로 걸렀는데 한 건도 안 남으면, 번호 없이 한 번 더 본다.
  //
  // 전자공시가 주는 사업자등록번호는 법인 본사 번호인데, 국민연금은 사업장별로
  // 등록되고 그 번호가 본사와 다를 수 있다. 실측(삼성물산): 전자공시 104812·
  // 202814, 국민연금 사업장 135850·468850. 번호를 걸면 435건이 0건이 되고
  // 0.16초 만에 "찾지 못함"이 나온다 — 부르지도 않고 없다고 답한 셈이다.
  //
  // 번호가 맞는 흔한 경우에는 이 두 번째 조회가 아예 일어나지 않는다.
  if (rows.length === 0 && wantedPrefix !== "") {
    const withoutPrefix = await lookUp("");
    if (withoutPrefix === null) {
      return { status: "failed" };
    }
    found = withoutPrefix;
    rows = withoutPrefix.rows;
    effectivePrefix = "";
  }

  if (rows.length === 0) {
    return { status: "not-found" };
  }

  // 두 이름으로 조회했으면 같은 사업장이 두 번 들어올 수 있다. seq 로 접는다.
  const unique = [...new Map(rows.map((row) => [row.seq, row])).values()];

  // 이름이 회사명과 똑같은 사업장이 있으면 그것만 본다. 부문·현장은 그 아래에
  // 딸린 것이라 함께 더하면 본사 규모를 부풀린다.
  const exact = unique.filter((row) => row.match === "exact");
  const candidates = exact.length > 0 ? exact : unique;

  // 이름이 같은 별개 회사가 실제로 있다(반도체 소자를 만드는 동일기연과
  // 난방보일러를 만드는 동일기연). DART가 준 사업자등록번호로 가른다.
  const prefixes = [...new Set(candidates.map((row) => row.bizrPrefix))];
  const owned =
    effectivePrefix !== ""
      ? candidates.filter((row) => row.bizrPrefix === effectivePrefix)
      : candidates;

  if (owned.length === 0) {
    return { status: "not-found" };
  }

  // 번호로 가리지 못했는데 이름이 똑같은 후보가 여럿이면 여기서 멈춘다. 아무거나
  // 고르면 다른 회사의 고용 규모를 이 회사 것인 양 보여주게 된다.
  //
  // 부문·현장으로 찾은 경우에는 멈추지 않는다. 이름 뒤에 붙은 것이 서로 달라
  // 애초에 헷갈릴 대상이 아니고(패션부문·건설부문·에버랜드리조트), 한 법인이
  // 부문마다 다른 사업자번호를 쓰는 것이 정상이기 때문이다. 실측(삼성물산):
  // 468850 건설, 135850 리조트, 101854 패션, 791850 상사.
  if (effectivePrefix === "" && exact.length > 0 && prefixes.length > 1) {
    return { status: "not-found" };
  }

  const months = [...new Set(owned.map((row) => row.dataCrtYm))].sort();
  const latest = months[months.length - 1];

  const employeeCount = await headcountAt(owned, latest);
  if (employeeCount === null) {
    // 사업장은 찾았는데 상세 조회가 대답하지 않았다. 없는 게 아니다.
    return { status: "failed" };
  }

  const past = await headcountAt(owned, shiftMonth(latest, CHANGE_WINDOW_MONTHS));

  return {
    status: "ok",
    value: {
      employeeCount,
      // 사업장 목록을 한 페이지만 받았고 실제로 더 있었다면, 더한 값은 하한이다.
      employeeCountIsAtLeast: found.truncated || undefined,
      employeeChange: past === null ? undefined : employeeCount - past,
      asOf: latest,
    },
  };
}
