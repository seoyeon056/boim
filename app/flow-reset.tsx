"use client";

import { useEffect } from "react";
import { useUploadStore } from "@/app/upload/upload-store";

// 진단 흐름이 브라우저에 남기는 값들. 처음 화면(/)에 오면 전부 비운다.
// 진단서까지 뽑고 로고를 눌러 돌아온 사용자가 새 진단을 시작할 때, 이전
// 업로드 파일·분석 결과가 그대로 들어 있으면 안 된다.
export const FLOW_KEYS = [
  "boimDocumentUpload",
  "boimExtractedTransactions",
  "boimExtractionOutcome",
  "boimDocumentTerms",
  "boimAnalysisResult",
  "boimSettlement",
  "boimAiConsent",
  "boimFlowCompany",
];

// 진단 흐름이 브라우저에 남긴 값을 모두 지운다. 처음 화면과 "새 기업 진단"에서 쓴다.
export function clearFlowState() {
  try {
    for (const key of FLOW_KEYS) sessionStorage.removeItem(key);
  } catch {
    // sessionStorage 를 못 쓰는 환경은 그냥 넘어간다.
  }
}

export function FlowReset() {
  const { reset } = useUploadStore();

  useEffect(() => {
    reset();
    clearFlowState();
  }, [reset]);

  return null;
}
