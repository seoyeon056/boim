"use client";

import { useSyncExternalStore } from "react";
import type { StoredUpload } from "@/types/document";

// 통계 요약과 판단 근거 문서 목록.
// 업로드 내역(sessionStorage)은 브라우저에만 있으므로 이 부분만 클라이언트에서 읽는다.

const STORAGE_KEY = "boimDocumentUpload";
const DEFAULT_CATEGORY_COUNT = 6;

// sessionStorage는 React 바깥의 저장소라 useSyncExternalStore로 읽는다.
// getSnapshot은 같은 값에 대해 같은 참조를 돌려줘야 해서 파싱 결과를 캐시한다.
let cachedRaw: string | null = null;
let cachedUpload: StoredUpload | null = null;

function getSnapshot(): StoredUpload | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUpload = raw ? (JSON.parse(raw) as StoredUpload) : null;
    } catch {
      cachedUpload = null;
    }
  }

  return cachedUpload;
}

// 업로드 기록은 이 화면에 들어온 뒤로 바뀌지 않으므로 구독할 것이 없다.
function subscribe(): () => void {
  return () => {};
}

export function SignalsEvidence({
  customerCount,
  previousCustomersCount,
  repeatPurchaseRate,
}: {
  customerCount: number;
  previousCustomersCount: number;
  repeatPurchaseRate: number;
}) {
  // 서버 렌더 시에는 null(기록 없음)로 두고, 브라우저에서 실제 값을 읽는다.
  const upload = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const usedDocs =
    upload?.categories.filter((c) => c.status === "uploaded") ?? [];
  const missingDocs =
    upload?.categories.filter((c) => c.status !== "uploaded") ?? [];

  const stats = [
    { label: "분석 거래처", value: `${customerCount}곳` },
    { label: "이전 기간 거래처", value: `${previousCustomersCount}곳` },
    { label: "반복 거래 발생", value: `${repeatPurchaseRate}%` },
    { label: "검증 문서", value: `${usedDocs.length}종` },
  ];

  return (
    <>
      {/* 통계 요약 */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-zinc-100 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 bg-white px-5 py-4"
          >
            <span className="text-[11px] text-zinc-400">{stat.label}</span>
            <span className="font-mono text-[20px] font-medium tabular-nums text-zinc-900">
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* 판단 근거 문서 */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between border-b border-zinc-900 pb-2">
          <h2 className="text-[14px] font-bold text-zinc-900">판단 근거 문서</h2>
          <span className="font-mono text-[11px] text-zinc-400">
            {usedDocs.length} /{" "}
            {upload?.categories.length ?? DEFAULT_CATEGORY_COUNT}
          </span>
        </div>

        {usedDocs.length === 0 && missingDocs.length === 0 ? (
          <p className="mt-4 text-[12px] text-zinc-400">
            업로드 기록을 확인할 수 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col">
            {[...usedDocs, ...missingDocs].map((doc) => {
              const used = doc.status === "uploaded";

              return (
                <li
                  key={doc.categoryId}
                  className="flex items-center justify-between gap-4 border-b border-zinc-100 py-3 transition-colors hover:bg-white"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-1.5 w-4 shrink-0 rounded-sm"
                      style={{ backgroundColor: used ? "#1D4533" : "#BCB0A9" }}
                    />
                    <span
                      className={`text-[13px] ${
                        used ? "text-zinc-900" : "text-zinc-400"
                      }`}
                    >
                      {doc.categoryName}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                    {used ? `${doc.fileCount}건 반영` : "문서 없음"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[11px] leading-5 text-zinc-400">
          지표는 위 문서에서 추출한 거래 기록만을 근거로 산정되었으며, 검증되지
          않은 항목은 계산에서 제외되었습니다.
        </p>
      </div>
    </>
  );
}
