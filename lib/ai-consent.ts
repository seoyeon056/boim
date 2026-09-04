"use client";

// AI 해석 사용 동의를 진단 흐름 전체에서 한 번만 받는다.
//
// Step 05에서 "AI 해석 받기"를 누른 사람에게 리포트에서 또 누르라고 하는 건
// 같은 질문을 두 번 하는 것이다. 두 화면이 보내는 것도 같은 종류다 — 이름 없는
// 비율 수치. 그래서 한 번의 동의로 흐름 안에서는 계속 쓴다.
//
// 동의는 기업 단위다. 예전에는 "granted" 한 글자만 남겨서, 한빛정밀에서 누른
// 동의가 그 뒤에 고른 동일기연 진단서까지 따라가 AI 종합 의견이 저절로 쓰였다.
// 누른 적 없는 기업의 수치를 외부로 보내는 셈이라 어느 기업에 대해 동의했는지
// 함께 적는다.
//
// sessionStorage라 탭을 닫으면 사라진다. 다음에 다시 오면 다시 묻는다.
const STORAGE_KEY = "boimAiConsent";

export function hasAiConsent(companyId: string | undefined): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  // 예전 값("granted")은 어느 기업 것인지 알 수 없으므로 동의로 보지 않는다.
  return sessionStorage.getItem(STORAGE_KEY) === (companyId ?? "");
}

export function grantAiConsent(companyId: string | undefined): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, companyId ?? "");
}
