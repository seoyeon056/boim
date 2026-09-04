"use client";

import { useSyncExternalStore } from "react";
import {
  readUploadSnapshot,
  serverUploadSnapshot,
  subscribeUpload,
} from "@/lib/uploaded-documents";
import { documentCategories } from "@/data/documentCategories";

// 통계 요약과 판단 근거 문서 목록.
// 업로드 내역(sessionStorage)은 브라우저에만 있으므로 이 부분만 클라이언트에서 읽는다.

const DEFAULT_CATEGORY_COUNT = 6;

// 문서마다 역할이 다르다. 화면에 그 역할을 그대로 적는다.
//
//   analyzed   거래 실적. 매출·거래처·성장 신호를 여기서 계산한다.
//   settlement 입금 확인. 매출에 합산하지 않고 입금 여부만 곁들인다.
//   그 밖      진단서 붙임에 이름만 오른다.
//
// 예전에는 여섯 줄 모두 "N건 반영"이라고 적었다. 파일 개수를 세는 말이라 거짓은
// 아니지만, 읽는 사람은 "이 문서가 지표에 들어갔다"로 이해한다. 그래서 둘로
// 갈랐는데, 그 뒤 입금내역이 입금 확인 전용으로 분리되면서 둘로는 모자라게 됐다.
// 입금내역을 "붙임"이라고 적으면 바로 위에서 "입금 22건을 확인했습니다"라고
// 말하는 화면과 어긋난다. 역할이 셋이므로 라벨도 셋이다.
const ANALYZED_CATEGORIES = new Set(
  documentCategories.filter((c) => c.analyzed).map((c) => c.id),
);

const SETTLEMENT_CATEGORIES = new Set(
  documentCategories.filter((c) => c.settlement).map((c) => c.id),
);

function roleLabel(categoryId: string, fileCount: number): string {
  if (ANALYZED_CATEGORIES.has(categoryId)) {
    return `${fileCount}건 · 지표 반영`;
  }
  if (SETTLEMENT_CATEGORIES.has(categoryId)) {
    return `${fileCount}건 · 입금 확인`;
  }
  return `${fileCount}건 · 붙임`;
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
  const upload = useSyncExternalStore(
    subscribeUpload,
    readUploadSnapshot,
    serverUploadSnapshot,
  );

  const usedDocs =
    upload?.categories.filter((c) => c.status === "uploaded") ?? [];
  const missingDocs =
    upload?.categories.filter((c) => c.status !== "uploaded") ?? [];

  const stats = [
    { label: "분석 거래처", value: `${customerCount}곳` },
    { label: "이전 기간 거래처", value: `${previousCustomersCount}곳` },
    { label: "반복거래율", value: `${repeatPurchaseRate}%` },
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
                    {used ? roleLabel(doc.categoryId, doc.fileCount) : "문서 없음"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          문서가 하나도 없을 때까지 "위 문서에서 추출한 거래 기록만을 근거로"라고
          쓰면 바로 위에 있는 "업로드 기록을 확인할 수 없습니다"와 정면으로
          어긋난다. 실제로는 예시 데이터로 계산한 화면이다.
        */}
        <p className="mt-4 text-[11px] leading-5 text-zinc-400">
          {usedDocs.length === 0
            ? "근거로 삼은 문서가 없어 위 지표는 예시 데이터로 산정되었습니다. 문서를 올리면 그 거래 기록만으로 다시 계산됩니다."
            : "지표는 위 문서에서 추출한 거래 기록만을 근거로 산정되었으며, 검증되지 않은 항목은 계산에서 제외되었습니다."}
        </p>
      </div>
    </>
  );
}
