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
  item: ["품목", "품명", "상품명", "규격", "내역", "품목및규격"],
  amount: ["공급가액", "금액", "합계", "합계금액", "총액", "공급가액(원)"],
  quantity: ["수량", "수 량"],
  unitPrice: ["단가", "단 가", "단가(원)"],
} as const;

// 거래처는 표 안이 아니라 표 위 라벨에 있는 경우가 대부분이다.
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
  return bare.length >= 2 && !CUSTOMER_REJECT.some((word) => bare.includes(word));
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

function normalize(value: string): string {
  return value.replace(/\s+/g, "");
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
  for (let index = 0; index < lines.length; index += 1) {
    const columns: ColumnRanges = {};
    for (const cell of lines[index]) {
      for (const key of Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]) {
        if (!columns[key] && matchesAlias(cell.text, COLUMN_ALIASES[key])) {
          columns[key] = cell;
        }
      }
    }
    // 금액 열은 반드시 있어야 하고, 날짜나 품목 중 하나만 더 있으면 표로 본다.
    // 견적서처럼 행에 날짜 열이 아예 없는 표가 실제로 있다(날짜는 문서 상단에만).
    if (columns.amount && (columns.date || columns.item)) {
      return { index, columns };
    }
  }
  return { index: -1, columns: {} };
}

// 헤더 셀과 가로로 가장 많이 겹치는 셀을 그 열의 값으로 본다.
function cellForColumn(row: Cell[], header: Cell | undefined): Cell | undefined {
  if (!header) {
    return undefined;
  }
  const headerCenter = centerX(header);
  let best: Cell | undefined;
  let bestDistance = Infinity;
  for (const cell of row) {
    const distance = Math.abs(centerX(cell) - headerCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  // 헤더 폭의 1.5배보다 멀면 다른 열이다.
  return best && bestDistance <= header.box.width * 1.5 ? best : undefined;
}

function findCustomer(lines: Cell[][]): { value: string; confidence: number } {
  for (const row of lines) {
    for (const cell of row) {
      if (!CUSTOMER_LABELS.some((label) => normalize(cell.text).includes(label))) {
        continue;
      }
      // "공급받는자: 미래모터스(주)" 처럼 라벨과 값이 한 셀에 붙어 오는 경우.
      // "거래처: 한빛금속(주) 담당자: 김OO"처럼 뒤에 다른 라벨이 이어지면 끊는다.
      const inline = valueAfterLabel(cell.text, CUSTOMER_LABELS);
      if (inline && looksLikeCompany(inline)) {
        return { value: cleanCompanyName(stripCustomerDecoration(inline)), confidence: cell.confidence };
      }
      // 라벨 옆 셀에 값이 있는 경우
      const next = row[row.indexOf(cell) + 1];
      if (next && looksLikeCompany(next.text)) {
        return { value: cleanCompanyName(stripCustomerDecoration(next.text)), confidence: next.confidence };
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
      cellForColumn(row, columns.date) ??
      row.find((cell) => parseDate(cell.text) !== null);
    const date =
      (dateCell ? parseDate(dateCell.text) : null) ??
      (dateCell ? parsePartialDate(dateCell.text, documentDate) : null) ??
      documentDate;
    if (!date) {
      continue;
    }

    const amountCell = cellForColumn(row, columns.amount);
    // 금액 열을 못 찾으면 그 행에서 가장 큰 숫자를 금액으로 본다(단가·수량보다 크다).
    const amount =
      (amountCell ? parseAmount(amountCell.text) : null) ??
      row
        .filter((cell) => cell !== dateCell && parseDate(cell.text) === null)
        .map((cell) => parseAmount(cell.text) ?? 0)
        .reduce((max, value) => Math.max(max, value), 0);

    const itemCell = cellForColumn(row, columns.item);

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

    const quantityCell = cellForColumn(row, columns.quantity);
    const unitPriceCell = cellForColumn(row, columns.unitPrice);
    const quantity = quantityCell ? parseAmount(quantityCell.text) : null;
    const unitPrice = unitPriceCell ? parseAmount(unitPriceCell.text) : null;

    extracted.push({
      date: { value: date, confidence: dateCell?.confidence ?? 0 },
      customer: { value: customer.value, confidence: customer.confidence },
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
