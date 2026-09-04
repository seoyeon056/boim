"use client";

// 지금 브라우저에 남아 있는 진단 자료가 "어느 기업의 것인지" 기록한다.
//
// 업로드 문서·추출 거래·입금 요약·AI 동의는 모두 sessionStorage 에 있는데,
// 어느 기업의 진단에서 나온 것인지는 어디에도 적혀 있지 않았다. 읽는 쪽은
// 주소의 ?company= 를 그대로 믿었다.
//
// 그래서 이런 일이 났다. 한빛정밀로 진단을 끝낸 뒤 단계 표시줄로 Step 01 에
// 돌아가 동일기연을 고르면(단계 표시줄 링크에는 ?company= 가 붙어 있어
// 초기화가 돌지 않는다), 동일기연 진단서에 한빛정밀의 문서 10개와 등급 B+ 가
// 그대로 실렸다. AI 종합 의견도 한빛정밀에서 준 동의로 자동 작성됐다.
//
// 자료를 저장할 때 주인을 함께 적고, 읽을 때 주인이 다르면 없는 것으로 본다.
// 지우지는 않는다. 원래 기업으로 돌아가면 그 자료는 다시 유효하다.
const OWNER_KEY = "boimFlowCompany";

export function setFlowOwner(companyId: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(OWNER_KEY, companyId ?? "");
  } catch {
    // sessionStorage 를 못 쓰는 환경은 그냥 넘어간다.
  }
}

export function flowOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * 저장된 진단 자료를 `companyId` 의 것으로 써도 되는지.
 *
 * 주인이 적혀 있지 않은 자료는 이 기록이 생기기 전에 저장된 것이므로 막지
 * 않는다. 주인이 적혀 있고 다르면 남의 자료다.
 */
export function flowBelongsTo(companyId: string | undefined): boolean {
  const owner = flowOwner();
  return owner === null || owner === (companyId ?? "");
}
