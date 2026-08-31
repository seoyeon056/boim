// 시연용 거래명세서 엑셀을 다시 만든다.
//
// 기존 샘플은 거래가 6줄뿐이라 "실제 회사가 이럴 리 없다"는 인상을 줬다.
// 여기서는 거래처마다 6~8개월치, 매달 2~4건씩 쌓아 20줄 안팎으로 늘린다.
// 금액은 완만한 우상향에 소폭의 등락을 섞어 자연스럽게 둔다.
//
// 출력 형식은 lib/ocr/xlsx.ts 파서가 읽는 최소 xlsx 그대로다:
//   - zip(무압축 저장) + 중앙 디렉터리 + EOCD
//   - 모든 셀은 t="inlineStr"
//
// 한 번만 돌리면 되는 자산 생성기다. `node scripts/build-sample-xlsx.mjs`

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sample");

// ── CRC32 ──────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── 무압축 zip 작성 ────────────────────────────────────────────────
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = Buffer.from(data);
    const crc = crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); // compressed size
    local.writeUInt32LE(body.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len

    chunks.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0x21, 14); // date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(body.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ── xlsx 부품 ─────────────────────────────────────────────────────
const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES =
  xmlHead +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

const ROOT_RELS =
  xmlHead +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WB_RELS =
  xmlHead +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  "</Relationships>";

function workbookXml(sheetName) {
  return (
    xmlHead +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const COLS = ["A", "B", "C", "D", "E"];

function cell(col, rowNo, text) {
  return `<c r="${col}${rowNo}" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
}

// rows: 배열의 배열. 빈 셀은 null.
function sheetXml(rows) {
  const body = rows
    .map((cells, i) => {
      const rowNo = i + 1;
      const inner = cells
        .map((v, c) => (v == null || v === "" ? "" : cell(COLS[c], rowNo, v)))
        .join("");
      return `<row r="${rowNo}">${inner}</row>`;
    })
    .join("");
  return (
    xmlHead +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

function buildXlsx(sheetName, rows) {
  return zip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "xl/workbook.xml", data: workbookXml(sheetName) },
    { name: "xl/_rels/workbook.xml.rels", data: WB_RELS },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows) },
  ]);
}

// ── 데이터 ────────────────────────────────────────────────────────
const won = (n) => n.toLocaleString("en-US");

// 거래명세서 한 장 = 거래처 한 곳의 여러 달치 거래.
function statementRows({ customer, terms, months, items, base, step, qtyBase }) {
  const rows = [
    ["거래명세서"],
    ["공급받는자", customer],
    ["결제조건", terms],
    [],
    ["거래일자", "품목", "수량", "단가", "공급가액"],
  ];

  let total = 0;
  let idx = 0;
  for (const m of months) {
    const perMonth = 2 + (idx % 3); // 2~4건
    for (let k = 0; k < perMonth; k += 1) {
      const day = String(4 + ((idx * 7 + k * 5) % 22)).padStart(2, "0");
      const item = items[(idx + k) % items.length];
      // 완만한 우상향 + 소폭 등락
      const drift = base + step * idx + (((idx * 13 + k * 7) % 9) - 4) * (step / 6);
      const amount = Math.max(step, Math.round(drift / 10000) * 10000);
      const qty = qtyBase + ((idx * 3 + k * 11) % 40);
      const unit = Math.round(amount / qty / 100) * 100;
      rows.push([`2026-${m}-${day}`, item, String(qty), won(unit), won(amount)]);
      total += amount;
    }
    idx += 1;
  }

  rows.push([]);
  rows.push(["합계금액", "", "", "", won(total)]);
  return rows;
}

const H1 = ["01", "02", "03", "04", "05", "06"];
const H2 = ["07", "08", "09", "10", "11", "12"];

const STATEMENTS = [
  {
    file: "거래명세서_202608.xlsx",
    sheet: "거래명세서",
    ...{
      customer: "미래모터스(주)",
      terms: "납품 후 30일 현금",
      months: ["03", "04", "05", "06", "07", "08"],
      items: ["브레이크 센서 모듈", "ABS 하네스", "차속 센서", "휠 스피드 센서"],
      base: 14000000,
      step: 1400000,
      qtyBase: 90,
    },
  },
  {
    file: "거래명세서_대성테크_2026상반기.xlsx",
    sheet: "거래명세서",
    ...{
      customer: "대성테크(주)",
      terms: "납품 후 30일",
      months: H1,
      items: ["정밀 가공부품 A형", "정밀 가공부품 B형", "치공구 세트", "베어링 하우징"],
      base: 12000000,
      step: 1200000,
      qtyBase: 110,
    },
  },
  {
    file: "거래명세서_한울전자_2026상반기.xlsx",
    sheet: "거래명세서",
    ...{
      customer: "한울전자(주)",
      terms: "검수 완료 후 익월 15일",
      months: H1,
      items: ["커넥터 하우징", "PCB 브라켓", "실드 캔", "방열판"],
      base: 6800000,
      step: 720000,
      qtyBase: 400,
    },
  },
  {
    file: "거래명세서_동방정공_2026하반기.xlsx",
    sheet: "거래명세서",
    ...{
      customer: "동방정공(주)",
      terms: "납품 후 45일",
      months: H2,
      items: ["샤프트 어셈블리", "기어 블랭크", "플랜지", "부싱"],
      base: 9500000,
      step: 900000,
      qtyBase: 70,
    },
  },
];

// 입금내역 = 위 거래들이 실제로 회수된 내역(며칠 늦게 들어온 것도 섞는다).
function depositRows() {
  const rows = [
    ["입금내역"],
    ["예금주", "한빛정밀(주)"],
    [],
    ["입금일자", "보내는분", "적요", "입금액"],
  ];
  const payers = [
    "미래모터스(주)",
    "대성테크(주)",
    "한울전자(주)",
    "동방정공(주)",
    "새봄테크(주)",
    "한울부품",
  ];
  let total = 0;
  for (let i = 0; i < 22; i += 1) {
    const month = String(2 + Math.floor(i / 3)).padStart(2, "0");
    const day = String(6 + ((i * 9) % 20)).padStart(2, "0");
    const payer = payers[i % payers.length];
    const amount = 6000000 + (i % 7) * 1500000 + ((i * 37) % 5) * 400000;
    rows.push([`2026-${month}-${day}`, payer, "전자결제 입금", won(amount)]);
    total += amount;
  }
  rows.push([]);
  rows.push(["합계", "", "", won(total)]);
  return rows;
}

// ── 실행 ──────────────────────────────────────────────────────────
for (const s of STATEMENTS) {
  const rows = statementRows(s);
  const buf = buildXlsx(s.sheet, rows);
  writeFileSync(join(OUT_DIR, s.file), buf);
  console.log(`${s.file.padEnd(40)} ${rows.length - 7}건 · ${buf.length}B`);
}

{
  const rows = depositRows();
  const buf = buildXlsx("입금내역", rows);
  writeFileSync(join(OUT_DIR, "입금내역_2026상반기.xlsx"), buf);
  console.log(`입금내역_2026상반기.xlsx`.padEnd(40) + ` ${rows.length - 6}건 · ${buf.length}B`);
}
