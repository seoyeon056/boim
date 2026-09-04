/**
 * 진단일(오늘)을 한국 날짜 YYYY-MM-DD 로 돌려준다.
 *
 * `toISOString()` 을 쓰면 안 된다. 그건 UTC 기준이라 한국 시간으로 00시부터
 * 09시 사이에는 하루 전 날짜가 나온다. 실제로 9월 5일 00:46(KST)에 화면이
 * "진단일(2026-09-04)"이라고 적었고, 그날 날짜가 찍힌 거래는 미래 거래로
 * 몰려 과거 실적 계산에서 빠졌다.
 *
 * 브라우저의 시간대를 그대로 쓰지도 않는다. 거래문서의 날짜는 한국 달력
 * 날짜이고, 이 진단서는 한국 기준으로 읽힌다. 심사자가 다른 시간대에서 열어도
 * 같은 문서에 같은 진단일이 나와야 한다.
 */
export function todayInKorea(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}
