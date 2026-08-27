// 배포 도메인으로만 CORS를 허용한다. 전에는 "*"로 전면 개방돼 있어서
// 아무 사이트에서나 우리 API를 스크립트로 불러 쓸 수 있었다.
const ALLOWED_ORIGIN = "https://boim-hazel.vercel.app";

export function getCorseHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
