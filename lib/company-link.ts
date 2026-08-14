// 진단 흐름(STEP 1 → 6) 전체가 "어느 기업을 진단하는 중인지"를
// URL 쿼리 파라미터로 들고 다닌다.
// 서버 컴포넌트(/visibility, /compare 등)는 sessionStorage 를 읽을 수 없으므로
// 선택한 기업은 URL 로 넘겨야 한다.
export const COMPANY_PARAM = "company";

export function withCompany(
  path: string,
  companyId?: string | null,
): string {
  if (!companyId) {
    return path;
  }

  return `${path}?${COMPANY_PARAM}=${encodeURIComponent(companyId)}`;
}

// searchParams 값은 문자열일 수도, 배열일 수도, 없을 수도 있다.
export function readCompanyId(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : undefined;
}
