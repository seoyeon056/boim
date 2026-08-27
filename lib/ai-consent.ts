"use client";

// AI 해석 사용 동의를 진단 흐름 전체에서 한 번만 받는다.
//
// Step 05에서 "AI 해석 받기"를 누른 사람에게 리포트에서 또 누르라고 하는 건
// 같은 질문을 두 번 하는 것이다. 두 화면이 보내는 것도 같은 종류다 — 이름 없는
// 비율 수치. 그래서 한 번의 동의로 흐름 안에서는 계속 쓴다.
//
// sessionStorage라 탭을 닫으면 사라진다. 다음에 다시 오면 다시 묻는다.
const STORAGE_KEY = "boimAiConsent";

export function hasAiConsent(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(STORAGE_KEY) === "granted";
}

export function grantAiConsent(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, "granted");
}
