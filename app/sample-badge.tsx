"use client";

import { useSyncExternalStore } from "react";
import {
  isSampleUpload,
  readUploadSnapshot,
  serverUploadSnapshot,
  subscribeUpload,
} from "@/lib/uploaded-documents";

// "샘플 문서 불러오기"로 진행한 진단이면 결과 화면·진단서에 이 표시를 붙인다.
// 업로드 내역은 sessionStorage 에만 있어 브라우저에서만 판단할 수 있다.
export function SampleDataBadge({
  className = "",
  variant = "pill",
}: {
  className?: string;
  variant?: "pill" | "line";
}) {
  const upload = useSyncExternalStore(
    subscribeUpload,
    readUploadSnapshot,
    serverUploadSnapshot,
  );

  if (!isSampleUpload(upload)) {
    return null;
  }

  if (variant === "line") {
    return (
      <p className={`text-[11px] leading-5 text-amber-700 ${className}`}>
        ※ 이 결과는 <b>샘플 데이터(예시)</b> 기반입니다. 실제 기업 데이터가
        아닙니다.
      </p>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 ${className}`}
    >
      샘플 데이터 기반
    </span>
  );
}
