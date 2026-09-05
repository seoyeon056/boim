// 브라우저 안에서만 도는 거래명세서 추출.
//
// 예전에는 파일을 base64로 만들어 Upstage API로 원본을 통째로 보냈다. 거래명세서에는
// 사업자번호·주소·계좌·직인이 다 들어 있어서, 이미지라 보내기 전에 가릴 방법도 없었다.
// 이제 인식까지 전부 브라우저에서 끝내고 파일은 기기를 벗어나지 않는다.
//
// 인식은 PaddleOCR PP-OCRv5 한국어 모델(ONNX)을 onnxruntime-web으로 돌린다.
// 실측(2026-08): 모델 최초 다운로드 6.9초(이후 캐시), 인식 1.3초/페이지.
// 테스트 명세서 3행을 100% 정확히 읽었다(전체 신뢰도 0.951).
import type {
  DocumentTerms,
  ExtractedTransactionRow,
} from "@/lib/ocr/types";

type Cell = {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
};

// PaddleOCR은 셀을 이미 행 단위로 묶어서 돌려준다. 표 재구성이 그만큼 쉬워진다.
type OcrResult = { lines: Cell[][] };

// 거래명세서마다 열 이름이 조금씩 다르다. 우리가 필요한 네 값에 대응하는 표기를 모아둔다.
const COLUMN_ALIASES = {
  date: ["거래일자", "일자", "날짜", "거래일", "월/일", "년월일", "월일"],
  // "적요"는 입금내역의 내역 칸이다("전자결제 입금"). 품목 칸이 비어 있으면
  // 아래에서 행을 통째로 버리기 때문에, 이걸 넣지 않으면 입금내역 전체가 사라진다.
  item: ["품목", "품명", "상품명", "규격", "내역", "품목및규격", "적요"],
  amount: ["공급가액", "금액", "합계", "합계금액", "총액", "공급가액(원)"],
  quantity: ["수량", "수 량"],
  unitPrice: ["단가", "단 가", "단가(원)"],
  // 거래처가 행마다 다른 문서가 있다. 입금내역·통장거래내역이 그렇다.
  // 이 열이 있으면 문서 상단 라벨보다 우선한다(아래 rowsFromOcr 참고).
  customer: ["보내는분", "받는분", "입금자", "송금인", "거래처명"],
} as const;

// 거래처는 표 안이 아니라 표 위 라벨에 있는 경우가 대부분이다.
// 다만 "대부분"이지 전부는 아니다 — COLUMN_ALIASES.customer 를 함께 본다.
const CUSTOMER_LABELS = ["수신", "공급받는자", "거래처", "상호", "귀하"];

// 라벨 값에는 거래처가 아닌 것들이 자주 섞인다.
//   "전자세금계산서 (공급받는자 보관용)"  제목 줄
//   "상호(법인명)"                        표 머리글
//   "수신: (주)글로벌네트웍스 귀중"        경칭이 붙은 값
// 앞뒤 군더더기를 떼어낸 뒤, 남은 게 회사 이름처럼 보일 때만 받아들인다.
// 수량(1)이나 순번(8) 같은 값을 금액으로 잘못 잡는 것을 막는 하한.
const MIN_TRANSACTION_AMOUNT = 1000;

// 표 하단 요약 줄을 걸러내는 말들.
const SUMMARY_WORDS = [
  "합계",
  "소계",
  "총계",
  "부가가치세",
  "부가세",
  "VAT",
  "총액",
  "계(",
];

const CUSTOMER_SUFFIXES = ["귀중", "귀하", "보관용", "보관"];
const CUSTOMER_REJECT = [
  "법인명",
  "법인",
  "공급자",
  "공급받는자",
  "등록번호",
  "대표",
  "보관용",
  "보관",
];

function stripCustomerDecoration(value: string): string {
  // 앞뒤 괄호·구두점을 먼저 떼야 "보관용)"처럼 닫는 괄호가 붙은 값도 걸러진다.
  let result = value.trim().replace(/^[)\]）,.\s]+|[([（\s]+$/g, "");
  for (const suffix of CUSTOMER_SUFFIXES) {
    result = result.replace(new RegExp(`\s*${suffix}\s*[)\]）]*\s*$`), "");
  }
  return result.replace(/^[)\]）,.\s]+/, "").trim();
}

function looksLikeCompany(value: string): boolean {
  const cleaned = stripCustomerDecoration(value);
  if (cleaned.length < 2) {
    return false;
  }
  // "(법인명)"처럼 괄호만 남은 값은 머리글이지 거래처가 아니다.
  if (/^[([（].*[)\]）]$/.test(cleaned)) {
    return false;
  }
  const bare = cleaned.replace(/[()（）㈜\s]/g, "");
  if (bare.length < 2) {
    return false;
  }
  // 숫자와 기호만 남으면 회사 이름이 아니다.
  //
  // 라벨 옆 칸을 값으로 집는 경로가 있어서, 라벨처럼 읽힌 셀 뒤에 금액이 오면
  // 그 금액이 거래처가 됐다. 실측: 거래처를 비운 행의 품목이 "빈거래처 A"라
  // 라벨로 걸렸고, 그 옆의 500000 이 세 행의 거래처명으로 들어갔다. 화면에는
  // "500000"이라는 거래처가 생기고 지표에도 한 곳으로 세어졌다.
  if (!/[가-힣A-Za-z]/.test(bare)) {
    return false;
  }
  return !CUSTOMER_REJECT.some((word) => bare.includes(word));
}

// "㈜"는 한 글자짜리 조합 문자라 OCR이 자주 흘린다. 실측에서 "(쥐)"로 읽히거나
// 닫는 괄호가 통째로 빠져 "한빛금속("으로 끝나는 경우를 확인했다.
// 신뢰도가 떨어져 검수 대상에는 걸리지만, 뻔한 오인식은 미리 되돌려 준다.
export function cleanCompanyName(value: string): string {
  return value
    .replace(/\(\s*[쥐줘주]\s*\)/g, "㈜")
    .replace(/[(（]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// 라벨을 견줄 때 쓰는 정규화.
//
// 공백만 지우면 OCR이 글자 사이에 끼워 넣은 부호를 못 넘긴다. 실측: 스캔 PDF에서
// "공급받는자"가 "공급받-는자"로 읽혔고, 그 탓에 거래처 라벨을 못 찾아 거래처가
// 빈 값이 됐다. 값("대성정공(주)")은 바로 옆에 멀쩡히 읽혔는데도 그랬다.
//
// 거래처가 비면 그 거래는 지표 계산에서 통째로 빠진다(lib/uploaded-signals.ts).
// 실제로 열 건 중 다섯 건이 조용히 사라졌다. 라벨은 뜻만 맞으면 되므로
// 구분 기호를 함께 지운다. 괄호는 남긴다 — "상호(법인명)"처럼 괄호 안이
// 라벨의 일부인 경우가 있어서다.
function normalize(value: string): string {
  return value.replace(/[\s\-–—_·‧・.,:;/\|~]/g, "");
}

function matchesAlias(text: string, aliases: readonly string[]): boolean {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(alias));
}

// 문서 상단의 발행일. 행마다 날짜가 없거나 "08/25"처럼 연도가 빠진 표가 많아서,
// 그런 행에 채워 넣을 기준 날짜가 필요하다.
const DOCUMENT_DATE_LABELS = [
  "작성일자",
  "거래일자",
  "견적일자",
  "발행일",
  "발주일자",
  "발급일시",
  "거래일시",
];

function findDocumentDate(lines: Cell[][]): string | null {
  for (const row of lines) {
    const text = row.map((cell) => cell.text).join(" ");
    if (!DOCUMENT_DATE_LABELS.some((label) => normalize(text).includes(label))) {
      continue;
    }
    const parsed = parseDate(text);
    if (parsed) {
      return parsed;
    }
  }
  // 라벨을 못 찾으면 문서에 등장하는 첫 온전한 날짜를 쓴다.
  for (const row of lines) {
    const parsed = parseDate(row.map((cell) => cell.text).join(" "));
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

// "08/25"처럼 연도가 없는 값에 문서 날짜의 연도를 붙인다.
function parsePartialDate(text: string, documentDate: string | null): string | null {
  if (!documentDate) {
    return null;
  }
  const match = text.match(/(?:^|[^\d])(\d{1,2})\s*[-./]\s*(\d{1,2})(?:[^\d]|$)/);
  if (!match) {
    return null;
  }
  const [, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) {
    return null;
  }
  return `${documentDate.slice(0, 4)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// "2026-03-02", "2026.03.02", "2026/3/2", "2026년 08월 15일" 을 YYYY-MM-DD로 맞춘다.
function parseDate(text: string): string | null {
  const match = text.match(
    /(\d{4})\s*(?:[-./]|년\s*)\s*(\d{1,2})\s*(?:[-./]|월\s*)\s*(\d{1,2})/,
  );
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// "2,220,000원" -> 2220000
function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (digits === "") {
    return null;
  }
  return Number(digits);
}

function centerX(cell: Cell): number {
  return cell.box.x + cell.box.width / 2;
}

type ColumnRanges = Partial<Record<keyof typeof COLUMN_ALIASES, Cell>>;

// 헤더 행을 찾아 각 열의 위치를 기억한다.
// 헤더를 못 찾으면 열 매핑을 포기하고 값의 생김새로만 판단한다.
function findHeader(lines: Cell[][]): { index: number; columns: ColumnRanges } {
  // 금액+날짜만 있는 후보. 진짜 표 머리를 끝까지 찾아보고 없을 때만 쓴다.
  let weaker: { index: number; columns: ColumnRanges } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const columns: ColumnRanges = {};
    for (const cell of lines[index]) {
      for (const key of Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]) {
        if (!columns[key] && matchesAlias(cell.text, COLUMN_ALIASES[key])) {
          columns[key] = cell;
        }
      }
    }

    // 품목 열이 있는 행이 진짜 표 머리다. 가장 구체적인 후보라 바로 확정한다.
    // 견적서처럼 행에 날짜 열이 아예 없는 표도 여기서 잡힌다(날짜는 문서 상단에만).
    if (columns.amount && columns.item) {
      return { index, columns };
    }

    // 금액+날짜만 있는 행도 표 머리일 수 있지만, 먼저 나온다고 바로 쓰면 안 된다.
    //
    // 전자세금계산서는 품목 표 위에 "작성일자 / 공급가액(원) / 세액(원) / 비고"
    // 요약 칸이 먼저 나온다. "작성일자"는 날짜 별칭 "일자"를, "공급가액(원)"은
    // 금액 별칭 "공급가액"을 포함해서 이 조건에 걸린다. 그걸 헤더로 확정하면
    // 품목 열이 없는 채로 확정되고, 아래 품목 세 줄이 전부 "품목이 빈 행"으로
    // 버려진다(실측: 5,000,000 / 1,500,000 / 800,000 세 건이 통째로 사라졌다).
    if (!weaker && columns.amount && columns.date) {
      weaker = { index, columns };
    }
  }

  return weaker ?? { index: -1, columns: {} };
}

// 헤더 셀과 가로로 가장 많이 겹치는 셀을 그 열의 값으로 본다.
// 이 열의 값으로 쓸 셀 하나. 없으면 undefined.
//
// "가장 가까운 셀"만으로는 부족하다. 어떤 칸이 비어 있으면 옆 열의 값이 그
// 자리로 끌려온다. 실측: 거래처를 비워 둔 엑셀 행에서 거래처명 헤더(중심 150)
// 기준으로 날짜 셀(50)과 품목 셀(250)이 똑같이 100만큼 떨어져 있어, 먼저 만난
// 날짜가 거래처로 뽑혔다. 화면에는 거래처가 "2026-08-10"인 거래가 생겼고 확인
// 대상으로도 걸리지 않아, 없는 거래처 한 곳이 지표에 그대로 들어갔다.
//
// 그래서 셀마다 "가장 가까운 헤더"를 먼저 정하고, 그게 이 열일 때만 값으로
// 쓴다. 자기 열에 이미 속한 셀은 다른 열이 데려가지 못한다.
function cellForColumn(
  row: Cell[],
  header: Cell | undefined,
  allHeaders: Cell[] = [],
): Cell | undefined {
  if (!header) {
    return undefined;
  }
  const headerCenter = centerX(header);
  const others = allHeaders.filter((other) => other !== header);

  let best: Cell | undefined;
  let bestDistance = Infinity;
  for (const cell of row) {
    const distance = Math.abs(centerX(cell) - headerCenter);
    if (distance >= bestDistance) {
      continue;
    }
    // 다른 열의 머리글에 더 가까우면 그 열의 값이다.
    const closerElsewhere = others.some(
      (other) => Math.abs(centerX(cell) - centerX(other)) < distance,
    );
    if (closerElsewhere) {
      continue;
    }
    bestDistance = distance;
    best = cell;
  }

  // 헤더 폭의 1.5배보다 멀면 다른 열이다.
  return best && bestDistance <= header.box.width * 1.5 ? best : undefined;
}

// 칸이 좁으면 회사명이 다음 줄로 넘어간다. 넘어간 조각을 찾아 돌려준다.
//
// 실측(전자세금계산서): 거래처가 "㈜한국테크놀로"로 잘려 나왔다. 원문은 이렇다.
//
//   y=104.1  101-86-1234 | 상호(법인 | (주)한국테크놀로 | 214-85-6789 | …
//   y=109.6  등록번호 | 등록번호                       ← 다른 열의 라벨
//   y=115.1  5 | ) | 지 | 0 | ) | 스                  ← 넘어간 조각들
//
// 넘어간 줄이 바로 다음 줄이 아니라는 점(사이에 라벨 줄이 낀다), 그리고 여섯
// 조각 중 왼쪽 끝이 맞는 건 회사명 둘뿐이라는 점(나머지는 가운데 정렬)이 걸려서
// 줄 단위로 통째 병합하는 방식은 쓰지 않았다. 거래처 값에만 좁게 붙인다.
//
// 조건을 좁게 잡는다. 표의 다음 행을 회사명 뒤에 붙이면 없는 거래처를 만들어낸다.
//   - 왼쪽 끝이 같을 것(가운데 정렬된 다른 칸은 여기서 걸러진다)
//   - 글자 높이의 1.6배 안쪽에 있을 것(표의 행 간격은 이보다 넓다. 위 문서에서
//     넘어간 줄은 1.29배, 품목 표의 행 간격은 2.47배였다)
//   - 짧을 것. 넘어가는 건 이름의 꼬리라 한두 글자다
const WRAP_PITCH = 1.6;
const WRAP_ALIGN = 1.5;
const WRAP_MAX_LENGTH = 3;

// 표 머리글이나 라벨은 이어지는 조각이 아니다.
//
// 엑셀은 행 간격이 일정해서 "넘어간 줄은 표의 행 간격보다 촘촘하다"는 규칙이
// 통하지 않는다. 실측: 거래처 바로 아래가 표 머리인 문서에서 "한결기공(주)"에
// 아랫줄의 "품목"이 붙어 "한결기공㈜품목"이 됐다. 이름·수량·단가처럼 우리가
// 아는 라벨은 값의 꼬리일 수 없으므로 걸러 낸다.
function isLabelLike(text: string): boolean {
  const value = normalize(text);
  if (value === "") {
    return false;
  }
  if (CUSTOMER_LABELS.some((label) => value.includes(label))) {
    return true;
  }
  if (SUMMARY_WORDS.some((word) => value.includes(word))) {
    return true;
  }
  return Object.values(COLUMN_ALIASES).some((aliases) =>
    aliases.some((alias) => value.includes(alias)),
  );
}

function wrappedTail(lines: Cell[][], from: number, cell: Cell): string {
  // 엑셀 셀은 그 자체로 완결된 값이다. 칸이 좁아 다음 줄로 넘어가는 일은
  // 그림이나 PDF 텍스트 레이어에서만 생긴다. 신뢰도 1은 엑셀에서만 나온다.
  if (cell.confidence >= 1) {
    return "";
  }

  const height = cell.box.height || 10;

  for (let index = from + 1; index < lines.length; index += 1) {
    const row = lines[index];
    if (row.length === 0) {
      continue;
    }

    const gap = row[0].box.y - cell.box.y;
    if (gap <= 0) {
      continue;
    }
    if (gap > height * WRAP_PITCH) {
      return "";
    }

    const tail = row.find(
      (candidate) =>
        Math.abs(candidate.box.x - cell.box.x) <= WRAP_ALIGN &&
        candidate.text.length <= WRAP_MAX_LENGTH &&
        !isLabelLike(candidate.text),
    );
    if (tail) {
      return tail.text;
    }
  }

  return "";
}

function findCustomer(lines: Cell[][]): { value: string; confidence: number } {
  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index];
    for (const cell of row) {
      if (!CUSTOMER_LABELS.some((label) => normalize(cell.text).includes(label))) {
        continue;
      }
      // "공급받는자: 미래모터스(주)" 처럼 라벨과 값이 한 셀에 붙어 오는 경우.
      // "거래처: 한빛금속(주) 담당자: 김OO"처럼 뒤에 다른 라벨이 이어지면 끊는다.
      const inline = valueAfterLabel(cell.text, CUSTOMER_LABELS);
      if (inline && looksLikeCompany(inline)) {
        return {
          value: cleanCompanyName(stripCustomerDecoration(inline)),
          confidence: cell.confidence,
        };
      }
      // 라벨 옆 셀에 값이 있는 경우.
      //
      // 표의 머리글 줄은 걸러야 한다. "거래일자 | 거래처명 | 적요 | 공급가액"
      // 처럼 열 이름이 늘어선 줄에서는 "거래처명" 다음 칸이 옆 열의 이름("적요")
      // 이지 거래처가 아니다. 실측: 거래처를 비워 둔 행이 이 값을 물려받아
      // 거래처가 "적요"인 거래가 생겼고, 없는 거래처 한 곳이 지표에 들어갔다.
      const next = row[row.indexOf(cell) + 1];
      if (next && !isLabelLike(next.text) && looksLikeCompany(next.text)) {
        return {
          value: cleanCompanyName(
            stripCustomerDecoration(next.text + wrappedTail(lines, index, next)),
          ),
          confidence: next.confidence,
        };
      }
    }
  }
  return { value: "", confidence: 0 };
}

// ── 라벨 형식 문서 ─────────────────────────────────────────────
// 모든 거래명세서가 표는 아니다. 팀 데모 데이터처럼 "거래일자: 2026-03-02",
// "거래처: 한빛금속(주)", "공급가액 121,500,000원 / 총액 133,650,000원"처럼
// 라벨과 값이 한 줄에 붙어 나오는 문서가 있다. 이런 문서는 헤더 열이 없어서
// 표 매핑이 통하지 않는다. 문서 전체에서 라벨을 찾아 한 건으로 묶는다.
const LABELS = {
  date: ["거래일자", "거래일", "일자"],
  amount: ["공급가액", "총액", "합계"],
  item: ["거래내역", "품목", "품명"],
} as const;

// 한 줄에서 "라벨: 값" 또는 "라벨 값" 형태의 값을 꺼낸다.
// 뒤에 다른 라벨이 이어지면(거래유형, 담당부서 등) 거기서 끊는다.
function valueAfterLabel(text: string, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const at = text.indexOf(alias);
    if (at < 0) {
      continue;
    }
    let rest = text.slice(at + alias.length).replace(/^\s*[:：]?\s*/, "");
    // 같은 줄에 붙어 있는 다음 항목 라벨에서 자른다.
    const nextLabel = rest.search(/[가-힣]{2,6}\s*[:：]/);
    if (nextLabel > 0) {
      rest = rest.slice(0, nextLabel);
    }
    const trimmed = rest.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function labelRows(lines: Cell[][]): ExtractedTransactionRow[] {
  // 라벨 형식은 줄바꿈이 의미를 가지므로 셀을 줄 단위 문자열로 합친다.
  const texts = lines.map((row) => row.map((cell) => cell.text).join(" "));
  const confidences = lines.map(
    (row) =>
      row.reduce((sum, cell) => sum + cell.confidence, 0) / (row.length || 1),
  );

  let date: string | null = null;
  let dateConfidence = 0;
  let customer = "";
  let customerConfidence = 0;
  let item = "";
  let itemConfidence = 0;
  let amount = 0;
  let amountConfidence = 0;

  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i];

    if (!date) {
      const raw = valueAfterLabel(text, LABELS.date);
      const parsed = raw ? parseDate(raw) : null;
      if (parsed) {
        date = parsed;
        dateConfidence = confidences[i];
      }
    }

    if (!customer) {
      const raw = valueAfterLabel(text, CUSTOMER_LABELS);
      if (raw && looksLikeCompany(raw)) {
        customer = cleanCompanyName(stripCustomerDecoration(raw));
        customerConfidence = confidences[i];
      }
    }

    // 금액은 "공급가액 121,500,000원 / 부가세 ... / 총액 133,650,000원"처럼
    // 한 줄에 여러 개가 온다. 총액이 있으면 총액을, 없으면 공급가액을 쓴다.
    const totalRaw = valueAfterLabel(text, ["총액", "합계"]);
    const supplyRaw = valueAfterLabel(text, ["공급가액"]);
    const picked = parseAmount(totalRaw ?? "") ?? parseAmount(supplyRaw ?? "");
    if (picked && picked > amount) {
      amount = picked;
      amountConfidence = confidences[i];
    }

    // 품목은 "거래내역" 라벨 다음 줄에 오는 경우가 많다.
    if (!item && LABELS.item.some((alias) => normalize(text) === alias)) {
      const next = texts[i + 1];
      if (next) {
        item = next.trim();
        itemConfidence = confidences[i + 1] ?? 0;
      }
    }
  }

  if (!date || amount === 0) {
    return [];
  }

  return [
    {
      date: { value: date, confidence: dateConfidence },
      customer: { value: customer, confidence: customerConfidence },
      item: { value: item, confidence: itemConfidence },
      amount: { value: amount, confidence: amountConfidence },
    },
  ];
}

// ── 문서 전체에 걸리는 조건 ─────────────────────────────────
// 거래 건수나 금액만 봐서는 안 보이는 것들이다. 결제조건이 "납품 후 60일"이면
// 매출이 잡힌 뒤에도 두 달은 현금이 들어오지 않는다는 뜻이다.
const PAYMENT_LABELS = ["결제조건", "지급조건", "대금지급", "결제 조건"];
const DUE_LABELS = ["납기일자", "납기일", "납품기일", "납기"];

// 라벨 뒤 문장이 길게 이어질 수 있어(검수 완료 후 … 익월 15일 현금 지급) 길이를 자른다.
const MAX_TERMS_LENGTH = 60;

function findDocumentTerms(lines: Cell[][]): DocumentTerms {
  const terms: DocumentTerms = {};

  for (const row of lines) {
    const text = row.map((cell) => cell.text).join(" ");

    if (!terms.paymentTerms) {
      const raw = valueAfterLabel(text, PAYMENT_LABELS);
      if (raw) {
        // "납품 후 60일 / 기존 거래처"처럼 뒤에 다른 항목이 슬래시로 이어진다.
        // 결제조건에 해당하는 앞부분만 남긴다.
        terms.paymentTerms = raw
          .split(/\s*[/|·]\s*/)[0]
          .slice(0, MAX_TERMS_LENGTH)
          .trim();
        // "납품 후 60일", "60일 이내"에서 일수를 읽어낸다.
        // "익월 15일"처럼 날짜를 가리키는 표현은 일수가 아니므로 제외한다.
        const days = terms.paymentTerms.match(/(?:후|이내|기준)\s*(\d{1,3})\s*일/);
        if (days) {
          terms.paymentDays = Number(days[1]);
        }
      }
    }

    if (!terms.dueDate) {
      const raw = valueAfterLabel(text, DUE_LABELS);
      const parsed = raw ? parseDate(raw) : null;
      if (parsed) {
        terms.dueDate = parsed;
      }
    }
  }

  return terms;
}

export function termsFromOcr(result: OcrResult): DocumentTerms {
  return findDocumentTerms(result.lines ?? []);
}

export function rowsFromOcr(result: OcrResult): ExtractedTransactionRow[] {
  const lines = result.lines ?? [];
  const { index: headerIndex, columns } = findHeader(lines);

  // 셀이 어느 열에 속하는지 가리려면 열 머리글 전부를 알아야 한다.
  const headerCells = Object.values(columns).filter(
    (cell): cell is Cell => cell !== undefined,
  );
  const customer = findCustomer(lines);

  // 헤더가 없으면 표가 아니다. 억지로 훑으면 "거래일자: 2026-03-02" 한 줄에서
  // 날짜 숫자를 금액(20260302)으로 읽는 식으로 엉뚱한 값이 나온다.
  if (headerIndex < 0) {
    return labelRows(lines);
  }

  const documentDate = findDocumentDate(lines);
  const dataRows = lines.slice(headerIndex + 1);
  const extracted: ExtractedTransactionRow[] = [];

  for (const row of dataRows) {
    // 날짜는 세 단계로 찾는다.
    //   1) 행의 날짜 열 또는 온전한 날짜가 든 셀
    //   2) "08/25"처럼 연도가 빠진 값 + 문서 날짜의 연도
    //   3) 행에 날짜가 아예 없으면 문서 날짜 (견적서처럼 날짜 열이 없는 표)
    const dateCell =
      cellForColumn(row, columns.date, headerCells) ??
      row.find((cell) => parseDate(cell.text) !== null);
    const date =
      (dateCell ? parseDate(dateCell.text) : null) ??
      (dateCell ? parsePartialDate(dateCell.text, documentDate) : null) ??
      documentDate;
    if (!date) {
      continue;
    }

    const amountCell = cellForColumn(row, columns.amount, headerCells);
    // 금액 열을 못 찾으면 그 행에서 가장 큰 숫자를 금액으로 본다(단가·수량보다 크다).
    const amount =
      (amountCell ? parseAmount(amountCell.text) : null) ??
      row
        .filter((cell) => cell !== dateCell && parseDate(cell.text) === null)
        .map((cell) => parseAmount(cell.text) ?? 0)
        .reduce((max, value) => Math.max(max, value), 0);

    const itemCell = cellForColumn(row, columns.item, headerCells);

    // 품목이 비어 있는 행은 표의 장식 줄이거나 세금계산서의 요약 칸이다.
    // 실측에서 세금계산서 텍스트 레이어가 품목 없이 금액만 든 행을 5개 만들었다.
    const itemText = itemCell?.text.trim() ?? "";
    if (itemText === "") {
      continue;
    }

    // 금액이 0이거나 거래로 보기 힘들 만큼 작으면 거래가 아니다
    // (수량·순번 칸을 금액으로 잘못 잡은 경우가 여기 걸린다).
    if (!amount || amount < MIN_TRANSACTION_AMOUNT) {
      continue;
    }

    // 표 아래쪽 요약 줄(합계·소계·부가세)은 개별 거래가 아니다. 그대로 세면
    // 같은 금액을 두 번 세게 된다.
    const rowText = normalize(row.map((cell) => cell.text).join(""));
    if (SUMMARY_WORDS.some((word) => rowText.includes(word))) {
      continue;
    }

    // 거래처를 행에서 먼저 찾는다.
    //
    // 지금까지 추출기는 "문서 하나 = 거래처 하나"를 전제했다. 거래명세서와
    // 세금계산서는 그 전제가 맞지만 입금내역은 한 장에 여러 거래처가 섞인다.
    // 그래서 입금내역 22건이 통째로 빠지고, 새봄테크·한울부품 두 곳은 아예
    // 없는 거래처가 됐다(실측: 파일에는 94건·6곳인데 화면은 73건·5곳이었다).
    //
    // 행에 거래처 열이 없으면 예전처럼 문서 상단 라벨을 쓴다.
    const customerCell = cellForColumn(row, columns.customer, headerCells);
    const rowCustomer =
      customerCell && looksLikeCompany(customerCell.text)
        ? {
            value: cleanCompanyName(stripCustomerDecoration(customerCell.text)),
            confidence: customerCell.confidence,
          }
        : customer;

    const quantityCell = cellForColumn(row, columns.quantity, headerCells);
    const unitPriceCell = cellForColumn(row, columns.unitPrice, headerCells);
    const quantity = quantityCell ? parseAmount(quantityCell.text) : null;
    const unitPrice = unitPriceCell ? parseAmount(unitPriceCell.text) : null;

    extracted.push({
      date: { value: date, confidence: dateCell?.confidence ?? 0 },
      customer: { value: rowCustomer.value, confidence: rowCustomer.confidence },
      item: { value: itemText, confidence: itemCell?.confidence ?? 0 },
      amount: { value: amount, confidence: amountCell?.confidence ?? 0 },
      ...(quantity !== null && quantity > 0
        ? { quantity: { value: quantity, confidence: quantityCell?.confidence ?? 0 } }
        : {}),
      ...(unitPrice !== null && unitPrice > 0
        ? { unitPrice: { value: unitPrice, confidence: unitPriceCell?.confidence ?? 0 } }
        : {}),
    });
  }

  // 표에서 한 건도 못 뽑았으면 라벨 형식 문서로 보고 다시 시도한다.
  return extracted.length > 0 ? extracted : labelRows(lines);
}
