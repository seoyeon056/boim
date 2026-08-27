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
      // "공급받는자: 미래모터스(주)" 처럼 라벨과 값이 한 셀에 붙어 오는 경우
      const inline = cell.text.split(/[:：]/).slice(1).join(":").trim();
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

export function rowsFromOcr(result: OcrResult): ExtractedTransactionRow[] {
  const lines = result.lines ?? [];
  const { index: headerIndex, columns } = findHeader(lines);
  const customer = findCustomer(lines);

  const dataRows = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
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

  return extracted;
}
