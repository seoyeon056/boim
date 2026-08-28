// pdf.js가 한글(CID) PDF를 읽으려면 cMap 파일이 필요하다. 없으면 텍스트가 통째로
// 비어 나온다. CDN에 의존하지 않도록 빌드 전에 앱이 서빙할 위치로 복사한다.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "pdfjs");

await mkdir(to, { recursive: true });
await cp(join(from, "cmaps"), join(to, "cmaps"), { recursive: true });
await cp(join(from, "standard_fonts"), join(to, "standard_fonts"), { recursive: true });
await cp(
  join(from, "build", "pdf.worker.min.mjs"),
  join(to, "pdf.worker.min.mjs"),
);

console.log("pdf.js 자산 복사 완료 → public/pdfjs");
