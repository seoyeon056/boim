// 시연용 샘플 문서(엑셀)를 다시 만든다.
//
// 한빛정밀은 자동차 센서 부품 제조기업이다. 샘플 거래도 전부 그 품목으로
// 맞춘다(소프트웨어·클라우드·소재 거래는 넣지 않는다).
//
// 규칙:
//   - 완료된 거래(거래명세서·세금계산서)의 날짜는 모두 2026년 상반기다.
//     진단 시점(오늘) 이후 날짜가 섞이면 과거 실적 계산에서 빠지기 때문이다.
//   - 세금계산서는 미래모터스 거래명세서의 일부를 그대로 다시 담는다.
//     같은 거래가 두 문서에 있을 때 중복 없이 한 건으로 합쳐지는지 보이기 위함이다.
//   - 입금내역은 입금 확인용이다. 매출에는 합산되지 않는다.
//   - 견적서는 아직 성사되지 않은 거래라 미래(3분기) 날짜를 그대로 둔다.
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

// ── 거래 데이터 ───────────────────────────────────────────────────
const won = (n) => n.toLocaleString("en-US");

// 완만한 우상향 + 소폭 등락으로 한 거래처의 여러 달치 거래를 만든다.
function dealsFor({ months, items, base, step, qtyBase }) {
  const deals = [];
  let idx = 0;
  for (const m of months) {
    const perMonth = 2 + (idx % 3); // 2~4건
    for (let k = 0; k < perMonth; k += 1) {
      const day = String(4 + ((idx * 7 + k * 5) % 22)).padStart(2, "0");
      const item = items[(idx + k) % items.length];
      const drift = base + step * idx + (((idx * 13 + k * 7) % 9) - 4) * (step / 6);
      const amount = Math.max(step, Math.round(drift / 10000) * 10000);
      const qty = qtyBase + ((idx * 3 + k * 11) % 40);
      const unit = Math.round(amount / qty / 100) * 100;
      deals.push({ date: `2026-${m}-${day}`, item, qty, unit, amount });
    }
    idx += 1;
  }
  return deals;
}

// 거래명세서 한 장 = 거래처 한 곳의 여러 달치 거래.
function statementSheet(customer, terms, deals) {
  const rows = [
    ["거래명세서"],
    ["공급자", "한빛정밀(주)"],
    ["공급받는자", customer],
    ["결제조건", terms],
    [],
    ["거래일자", "품목", "수량", "단가", "공급가액"],
  ];
  let total = 0;
  for (const d of deals) {
    rows.push([d.date, d.item, String(d.qty), won(d.unit), won(d.amount)]);
    total += d.amount;
  }
  rows.push([]);
  rows.push(["합계금액", "", "", "", won(total)]);
  return rows;
}

// 전자세금계산서 = 위 거래명세서 거래의 일부를 그대로 다시 담는다.
// 같은 date·품목·공급가액이라 lib/ocr/run-local-ocr.ts 의 dedupe 가 한 건으로 합친다.
function taxInvoiceSheet(customer, deals) {
  const rows = [
    ["전자세금계산서"],
    ["공급자", "한빛정밀(주)"],
    ["공급받는자", customer],
    [],
    ["작성일자", "품목", "공급가액", "세액", "합계"],
  ];
  let supply = 0;
  let vat = 0;
  for (const d of deals) {
    const tax = Math.round(d.amount * 0.1);
    rows.push([d.date, d.item, won(d.amount), won(tax), won(d.amount + tax)]);
    supply += d.amount;
    vat += tax;
  }
  rows.push([]);
  rows.push(["합계금액", "", won(supply), won(vat), won(supply + vat)]);
  return rows;
}

// 견적서 = 아직 성사되지 않은 거래. 3분기 날짜를 그대로 둔다.
function quotationSheet(customer) {
  const rows = [
    ["견 적 서 (QUOTATION)"],
    ["공급자", "한빛정밀(주)"],
    ["수신", customer],
    ["견적일자", "2026-08-18"],
    ["유효기간", "견적일로부터 30일"],
    [],
    ["납품예정일", "품목", "수량", "단가", "견적금액"],
    ["2026-09-15", "차속 센서 신모델 시제품", "120", won(140000), won(16800000)],
    ["2026-10-05", "ADAS 레이더 마운팅 브래킷", "300", won(45000), won(13500000)],
    ["2026-10-20", "휠 스피드 센서 리비전 B", "260", won(52000), won(13520000)],
    [],
    ["견적 합계", "", "", "", won(43820000)],
  ];
  return rows;
}

// 입금내역 = 완료 거래가 실제로 회수된 내역(며칠 늦게 들어온 것도 섞는다).
// 입금 확인용이라 매출에는 합산하지 않는다.
function depositSheet(payers) {
  const rows = [
    ["입금내역"],
    ["예금주", "한빛정밀(주)"],
    [],
    ["입금일자", "보내는분", "적요", "입금액"],
  ];
  let total = 0;
  for (let i = 0; i < 20; i += 1) {
    const month = String(2 + Math.floor(i / 4)).padStart(2, "0");
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

const H1 = ["01", "02", "03", "04", "05", "06"];

const CUSTOMERS = [
  {
    file: "거래명세서_미래모터스_2026상반기.xlsx",
    customer: "미래모터스(주)",
    terms: "납품 후 30일 현금",
    items: ["브레이크 센서 모듈", "휠 스피드 센서", "요레이트 센서", "조향각 센서"],
    base: 14000000,
    step: 1400000,
    qtyBase: 90,
    invoice: "전자세금계산서_2026상반기.xlsx",
  },
  {
    file: "거래명세서_대성테크_2026상반기.xlsx",
    customer: "대성테크(주)",
    terms: "납품 후 30일",
    items: ["흡기압 센서", "냉각수온 센서", "오일압력 센서", "배기온도 센서"],
    base: 12000000,
    step: 1200000,
    qtyBase: 110,
  },
  {
    file: "거래명세서_한울전자_2026상반기.xlsx",
    customer: "한울전자(주)",
    terms: "검수 완료 후 익월 15일",
    items: ["센서 커넥터 하우징", "센서 브래킷", "하네스 어셈블리", "실링 캡"],
    base: 6800000,
    step: 720000,
    qtyBase: 400,
  },
  {
    file: "거래명세서_동방정공_2026상반기.xlsx",
    customer: "동방정공(주)",
    terms: "납품 후 45일",
    items: ["ABS 톤휠", "센서 타깃링", "마운팅 플레이트", "검사용 지그"],
    base: 9500000,
    step: 900000,
    qtyBase: 70,
  },
];

// ── 실행 ──────────────────────────────────────────────────────────
for (const c of CUSTOMERS) {
  const deals = dealsFor({ months: H1, ...c });
  const buf = buildXlsx("거래명세서", statementSheet(c.customer, c.terms, deals));
  writeFileSync(join(OUT_DIR, c.file), buf);
  console.log(`${c.file.padEnd(42)} ${deals.length}건 · ${buf.length}B`);

  if (c.invoice) {
    // 거래명세서 앞부분을 그대로 세금계산서에도 담아 중복 제거를 보인다.
    const overlap = deals.slice(0, 8);
    const ibuf = buildXlsx("전자세금계산서", taxInvoiceSheet(c.customer, overlap));
    writeFileSync(join(OUT_DIR, c.invoice), ibuf);
    console.log(
      `${c.invoice.padEnd(42)} ${overlap.length}건(명세서와 중복) · ${ibuf.length}B`,
    );
  }
}

{
  const buf = buildXlsx("견적서", quotationSheet("미래모터스(주)"));
  writeFileSync(join(OUT_DIR, "견적서_미래모터스_2026Q3.xlsx"), buf);
  console.log(`견적서_미래모터스_2026Q3.xlsx`.padEnd(42) + ` 3건 · ${buf.length}B`);
}

{
  const payers = [
    "미래모터스(주)",
    "대성테크(주)",
    "한울전자(주)",
    "동방정공(주)",
  ];
  const buf = buildXlsx("입금내역", depositSheet(payers));
  writeFileSync(join(OUT_DIR, "입금내역_2026상반기.xlsx"), buf);
  console.log(`입금내역_2026상반기.xlsx`.padEnd(42) + ` 20건 · ${buf.length}B`);
}
