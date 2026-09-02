import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupIntoLines, type Cell } from "./cells.ts";
import { rowsFromOcr } from "./local-extract.ts";

// public/sample 의 생성된 엑셀이 실제 추출 로직에서 어떻게 읽히는지 검증한다.
// cellsFromXlsx(브라우저 전용, DecompressionStream) 대신 STORED zip 을 직접 읽어
// 같은 Cell[][] 를 만든 뒤 진짜 rowsFromOcr 을 통과시킨다.

const DIR = join(process.cwd(), "public", "sample");
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 20;

function sheetXml(buf: Buffer): string {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = dec.decode(buf.subarray(offset + 46, offset + 46 + nameLen));
    if (name === "xl/worksheets/sheet1.xml") {
      const compSize = view.getUint32(offset + 20, true);
      const lnl = view.getUint16(localOffset + 26, true);
      const lel = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lnl + lel;
      return dec.decode(buf.subarray(start, start + compSize));
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("sheet not found");
}

function decodeXml(v: string): string {
  return v
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c: string) =>
      String.fromCodePoint(parseInt(c, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function cellsOf(file: string): Cell[][] {
  const xml = sheetXml(readFileSync(join(DIR, file)));
  const cells: Cell[] = [];
  for (const m of xml.matchAll(/<c[^>]*r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g)) {
    const ref = m[1];
    let col = 0;
    for (const ch of ref.match(/^[A-Z]+/)![0]) col = col * 26 + ch.charCodeAt(0) - 64;
    col -= 1;
    const row = Number(ref.match(/\d+$/)![0]);
    const text = [
      ...m[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>|<v>([\s\S]*?)<\/v>/g),
    ]
      .map(([, a, b]) => decodeXml(a ?? b ?? ""))
      .join(" ")
      .trim();
    if (text)
      cells.push({
        text,
        box: { x: col * COLUMN_WIDTH, y: row * ROW_HEIGHT, width: COLUMN_WIDTH, height: ROW_HEIGHT },
        confidence: 1,
      });
  }
  return groupIntoLines(cells, ROW_HEIGHT / 2);
}

// run-local-ocr.ts 의 dedupe 와 같은 키.
function dedupeKey(r: {
  date: { value: string };
  customer: { value: string };
  amount: { value: number };
  item: { value: string };
}): string {
  return [
    r.date.value,
    (r.customer.value ?? "").replace(/\s+/g, ""),
    r.amount.value,
    r.item.value.replace(/\s+/g, ""),
  ].join("|");
}

describe("샘플 문서 추출 파이프라인", () => {
  const STATEMENTS = [
    "거래명세서_미래모터스_2026상반기.xlsx",
    "거래명세서_대성테크_2026상반기.xlsx",
    "거래명세서_한울전자_2026상반기.xlsx",
    "거래명세서_동방정공_2026상반기.xlsx",
  ];
  const INVOICE = "전자세금계산서_2026상반기.xlsx";

  it("거래명세서 4장에서 거래처가 각각 하나씩 잡힌다", () => {
    for (const f of STATEMENTS) {
      const rows = rowsFromOcr({ lines: cellsOf(f) });
      assert.ok(rows.length >= 15, `${f}: ${rows.length}건`);
      const custs = new Set(rows.map((r) => r.customer.value));
      assert.equal(custs.size, 1, `${f}: 거래처 ${[...custs]}`);
      assert.ok([...custs][0].length >= 3, `${f}: 거래처명 "${[...custs][0]}"`);
    }
  });

  it("완료 거래는 전부 2026 상반기(진단일 이전)다", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const f of [...STATEMENTS, INVOICE]) {
      for (const r of rowsFromOcr({ lines: cellsOf(f) })) {
        assert.ok(/^2026-0[1-6]-/.test(r.date.value), `${f}: ${r.date.value}`);
        assert.ok(r.date.value <= today);
      }
    }
  });

  it("세금계산서는 미래모터스 명세서와 중복 → dedupe 후 매출이 늘지 않는다", () => {
    const all = [...STATEMENTS, INVOICE].flatMap((f) =>
      rowsFromOcr({ lines: cellsOf(f) }),
    );
    const stmtOnly = STATEMENTS.flatMap((f) =>
      rowsFromOcr({ lines: cellsOf(f) }),
    );
    const uniq = new Set(all.map(dedupeKey));
    assert.equal(
      uniq.size,
      stmtOnly.length,
      `dedupe 후 ${uniq.size} vs 명세서 ${stmtOnly.length}`,
    );
    assert.ok(all.length > uniq.size, "중복이 실제로 있었다");
  });
});
