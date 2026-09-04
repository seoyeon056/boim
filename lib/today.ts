/**
 * 진단일(오늘)을 YYYY-MM-DD 로 돌려준다.
 *
 * `toISOString()` 을 쓰면 안 된다. 그건 UTC 기준이라 한국 시간으로 00시부터
 * 09시 사이에는 하루 전 날짜가 나온다. 실제로 9월 5일 00:46(KST)에 화면이
 * "진단일(2026-09-04)"이라고 적었고, 그날 날짜가 찍힌 거래는 미래 거래로
 * 몰려 과거 실적 계산에서 빠졌다.
 *
 * 거래문서의 날짜는 사용자가 있는 곳의 달력 날짜다. 그래서 오늘도 같은
 * 달력으로 읽는다. 이 함수를 쓰는 곳은 모두 클라이언트 컴포넌트라
 * 사용자의 시간대가 그대로 적용된다.
 */
export function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
