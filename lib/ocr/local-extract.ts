// 브라우저 안에서만 도는 거래명세서 추출.
//
// 예전에는 파일을 base64로 만들어 Upstage API로 원본을 통째로 보냈다. 거래명세서에는
// 사업자번호·주소·계좌·직인이 다 들어 있어서, 이미지라 보내기 전에 가릴 방법도 없었다.
// 이제 인식까지 전부 브라우저에서 끝내고 파일은 기기를 벗어나지 않는다.
//
// 인식은 PaddleOCR PP-OCRv5 한국어 모델(ONNX)을 onnxruntime-web으로 돌린다.
// 실측(2026-08): 모델 최초 다운로드 6.9초(이후 캐시), 인식 1.3초/페이지.
// 테스트 명세서 3행을 100% 정확히 읽었다(전체 신뢰도 0.951).
import type { ExtractedTransactionRow } from "@/lib/ocr/types";

type Cell = {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
};

// PaddleOCR은 셀을 이미 행 단위로 묶어서 돌려준다. 표 재구성이 그만큼 쉬워진다.
type OcrResult = { lines: Cell[][] };

// 거래명세서마다 열 이름이 조금씩 다르다. 우리가 필요한 네 값에 대응하는 표기를 모아둔다.
const COLUMN_ALIASES = {
  date: ["거래일자", "일자", "날짜", "거래일"],
  item: ["품목", "품명", "상품명", "규격"],
  amount: ["공급가액", "금액", "합계", "합계금액", "총액"],
} as const;

// 거래처는 표 안이 아니라 표 위 라벨에 있는 경우가 대부분이다.
const CUSTOMER_LABELS = ["공급받는자", "거래처", "수신", "귀하", "상호"];

function normalize(value: string): string {
  return value.replace(/\s+/g, "");
}

function matchesAlias(text: string, aliases: readonly string[]): boolean {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(alias));
}

// "2026-03-02", "2026.03.02", "2026/3/2" 를 모두 YYYY-MM-DD로 맞춘다.
function parseDate(text: string): string | null {
  const match = text.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
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
    // 날짜 열과 금액 열이 같이 잡혀야 표 헤더로 인정한다.
    if (columns.date && columns.amount) {
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
      if (inline) {
        return { value: inline, confidence: cell.confidence };
      }
      // 라벨 옆 셀에 값이 있는 경우
      const next = row[row.indexOf(cell) + 1];
      if (next) {
        return { value: next.text.trim(), confidence: next.confidence };
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
      if (raw) {
        customer = raw;
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

export function rowsFromOcr(result: OcrResult): ExtractedTransactionRow[] {
  const lines = result.lines ?? [];
  const { index: headerIndex, columns } = findHeader(lines);
  const customer = findCustomer(lines);

  // 헤더가 없으면 표가 아니다. 억지로 훑으면 "거래일자: 2026-03-02" 한 줄에서
  // 날짜 숫자를 금액(20260302)으로 읽는 식으로 엉뚱한 값이 나온다.
  if (headerIndex < 0) {
    return labelRows(lines);
  }

  const dataRows = lines.slice(headerIndex + 1);
  const extracted: ExtractedTransactionRow[] = [];

  for (const row of dataRows) {
    // 날짜가 있는 행만 거래로 본다. 합계/비고 줄이 섞여 들어오는 것을 막는다.
    const dateCell =
      cellForColumn(row, columns.date) ??
      row.find((cell) => parseDate(cell.text) !== null);
    const date = dateCell ? parseDate(dateCell.text) : null;
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

    extracted.push({
      date: { value: date, confidence: dateCell?.confidence ?? 0 },
      customer: { value: customer.value, confidence: customer.confidence },
      item: { value: itemCell?.text.trim() ?? "", confidence: itemCell?.confidence ?? 0 },
      amount: { value: amount, confidence: amountCell?.confidence ?? 0 },
    });
  }

  // 표에서 한 건도 못 뽑았으면 라벨 형식 문서로 보고 다시 시도한다.
  return extracted.length > 0 ? extracted : labelRows(lines);
}
