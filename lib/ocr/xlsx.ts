import { groupIntoLines, type Cell } from "@/lib/ocr/cells";

// 엑셀 거래명세서·견적서를 읽는다.
//
// 실제 업무 문서는 스캔 이미지만이 아니라 엑셀로도 온다. 이미지로 만들어 OCR을
// 돌리는 건 손해다 — 셀 값이 이미 정확한 텍스트로 들어 있어서, 그대로 읽으면
// 오인식이 없다. 그래서 신뢰도는 1로 둔다.
//
// xlsx는 zip이고 시트는 XML이다. 이 문서들은 sharedStrings 없이 inlineStr만
// 쓰기 때문에 문자열 테이블을 따라갈 필요도 없다. 압축 해제는 브라우저 표준
// DecompressionStream을 쓴다(라이브러리 불필요).

const SHEET_PATH = "xl/worksheets/sheet1.xml";

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// zip 중앙 디렉터리를 훑어 원하는 항목 하나만 꺼낸다.
async function readZipEntry(
  buffer: ArrayBuffer,
  wanted: string,
): Promise<string | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // EOCD(0x06054b50)를 뒤에서부터 찾는다.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return null;
  }

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      return null;
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === wanted) {
      // 로컬 헤더에서 실제 데이터 시작 위치를 다시 구한다(이름/부가필드 길이가 다를 수 있다).
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      const inflated = method === 8 ? await inflateRaw(raw) : raw;
      return decoder.decode(inflated);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

// "B12" -> 열 인덱스 1, 행 12
function parseRef(ref: string): { column: number; row: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  let column = 0;
  for (const char of match[1]) {
    column = column * 26 + (char.charCodeAt(0) - 64);
  }
  return { column: column - 1, row: Number(match[2]) };
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// 열 너비를 모르므로 열 인덱스에 고정 폭을 곱해 가상 좌표를 만든다.
// 표 해석 로직이 헤더와 값의 x 거리를 보기 때문에 상대 위치만 맞으면 된다.
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 20;

export async function cellsFromXlsx(file: File): Promise<Cell[][]> {
  const sheet = await readZipEntry(await file.arrayBuffer(), SHEET_PATH);
  if (!sheet) {
    return [];
  }

  const cells: Cell[] = [];

  for (const [, ref, body] of sheet.matchAll(
    /<c[^>]*r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g,
  )) {
    const position = parseRef(ref);
    if (!position) {
      continue;
    }
    // inlineStr은 <is><t>…</t></is>, 숫자는 <v>…</v>로 온다.
    const text = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>|<v>([\s\S]*?)<\/v>/g)]
      .map(([, inline, value]) => decodeXmlText(inline ?? value ?? ""))
      .join(" ")
      .trim();

    if (text === "") {
      continue;
    }

    cells.push({
      text,
      box: {
        x: position.column * COLUMN_WIDTH,
        y: position.row * ROW_HEIGHT,
        width: COLUMN_WIDTH,
        height: ROW_HEIGHT,
      },
      // 엑셀 값은 읽어낸 게 아니라 그대로 들어 있는 값이다.
      confidence: 1,
    });
  }

  return groupIntoLines(cells, ROW_HEIGHT / 2);
}
