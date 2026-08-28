// 문서에서 뽑아낸 텍스트 조각의 공통 형태.
//
// OCR·PDF 텍스트 레이어·엑셀 세 경로가 모두 이 모양으로 맞춰 들어온다. 그래야
// 표/라벨 해석 로직(local-extract.ts)을 한 벌만 유지할 수 있다.
export type Cell = {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
};

// 같은 줄에 있는 조각들을 y좌표로 묶는다.
// OCR 결과는 이미 줄 단위로 오지만, PDF 텍스트 레이어와 엑셀은 조각 단위라
// 여기서 줄을 만들어야 한다.
export function groupIntoLines(cells: Cell[], tolerance = 6): Cell[][] {
  const sorted = [...cells].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const lines: Cell[][] = [];

  for (const cell of sorted) {
    const last = lines[lines.length - 1];
    const lastY = last?.[0]?.box.y;
    if (last && lastY !== undefined && Math.abs(cell.box.y - lastY) <= tolerance) {
      last.push(cell);
    } else {
      lines.push([cell]);
    }
  }

  return lines.map((line) => [...line].sort((a, b) => a.box.x - b.box.x));
}
