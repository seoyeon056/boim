"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { documentCategories } from "@/data/documentCategories";
import type {
  DocumentStatus,
  StoredCategory,
  StoredUpload,
} from "@/types/document";
import { withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { useUploadStore } from "./upload-store";

// ─────────────────────────────────────────────
// 파일 선택 제한값 (실제 서버 업로드는 하지 않지만,
// 실제 서비스와 비슷한 사용자 경험을 위해 미리 검사한다.)
// ─────────────────────────────────────────────
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 파일 한 개 최대 100MB
const MAX_FILES_PER_CATEGORY = 5; // 카테고리당 최대 5개
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 전체 최대 500MB

// 진행 게이지 3상태 색
const GAUGE_UPLOADED = "#1B1917";
const GAUGE_MISSING = "#B9B1A3";
const GAUGE_TRACK = "#EDE9E1";

const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "xlsx", "xls"];
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
];

function isAllowedFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_TYPES.includes(file.type);
}

// 바이트를 사람이 읽기 쉬운 KB/MB 단위로 변환한다.
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0KB";
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  }
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
}

export function UploadContent({ companyId }: { companyId?: string }) {
  const router = useRouter();

  // 모든 카테고리의 초기 상태는 "미선택(empty)" (upload-store.tsx에서 관리)
  const { states, setStates } = useUploadStore();

  // 카테고리별 오류 메시지 (파일 제한 위반 시 표시)
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // 저장 완료 여부 / 하단 안내 메시지
  const [isSaved, setIsSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 파일 input DOM을 기억해 두었다가 값 초기화(input.value = "")에 사용
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 다른 카테고리들의 합계 용량 (전체 용량 검사에 사용)
  function totalSizeExcluding(categoryId: string): number {
    return documentCategories.reduce((sum, category) => {
      if (category.id === categoryId) return sum;
      const files = states[category.id]?.files ?? [];
      return sum + files.reduce((inner, file) => inner + file.size, 0);
    }, 0);
  }

  function setCategoryError(categoryId: string, message: string | null) {
    setErrors((prev) => ({ ...prev, [categoryId]: message }));
  }

  function handleFileChange(
    categoryId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.target;
    const fileList = input.files;

    // 파일 선택을 취소한 경우: 기존 선택을 그대로 둔다.
    if (!fileList || fileList.length === 0) return;

    const newFiles = Array.from(fileList);
    const existingFiles = states[categoryId]?.files ?? [];

    // 1) 지원하지 않는 형식 검사
    if (newFiles.some((file) => !isAllowedFile(file))) {
      setCategoryError(
        categoryId,
        "지원하지 않는 파일 형식입니다. PDF, PNG, JPG, XLSX 파일을 선택해 주세요.",
      );
      input.value = "";
      return;
    }

    // 2) 카테고리당 최대 개수 검사 (이미 추가된 파일 + 새로 선택한 파일)
    if (existingFiles.length + newFiles.length > MAX_FILES_PER_CATEGORY) {
      setCategoryError(
        categoryId,
        `카테고리당 최대 5개까지 선택할 수 있습니다. (현재 ${existingFiles.length}개)`,
      );
      input.value = "";
      return;
    }

    // 3) 파일 한 개 최대 크기 검사
    if (newFiles.some((file) => file.size > MAX_FILE_SIZE)) {
      setCategoryError(
        categoryId,
        "파일 한 개는 최대 100 MB까지 선택할 수 있습니다.",
      );
      input.value = "";
      return;
    }

    // 4) 전체 선택 용량 검사 (이미 추가된 파일 포함)
    const existingCategorySize = existingFiles.reduce(
      (sum, file) => sum + file.size,
      0,
    );
    const newCategorySize = newFiles.reduce((sum, file) => sum + file.size, 0);
    if (
      totalSizeExcluding(categoryId) + existingCategorySize + newCategorySize >
      MAX_TOTAL_SIZE
    ) {
      setCategoryError(
        categoryId,
        "전체 파일 크기는 최대 500 MB까지 선택할 수 있습니다.",
      );
      input.value = "";
      return;
    }

    // 검사를 모두 통과: 기존 선택에 새 파일을 추가하고 상태를 uploaded로 바꾼다.
    // (파일을 선택하면 "해당 문서 없음" 상태는 자동으로 해제된다.)
    setStates((prev) => ({
      ...prev,
      [categoryId]: {
        status: "uploaded",
        files: [...existingFiles, ...newFiles],
      },
    }));
    setCategoryError(categoryId, null);
    setIsSaved(false);
    setNotice(null);
    // 같은 파일을 다시 선택할 수 있도록 input 값을 초기화한다.
    input.value = "";
  }

  // 파일 하나만 선택 목록에서 제거한다.
  function removeFile(categoryId: string, fileIndex: number) {
    setStates((prev) => {
      const current = prev[categoryId];
      const nextFiles = current.files.filter((_, index) => index !== fileIndex);
      return {
        ...prev,
        [categoryId]: {
          status: nextFiles.length > 0 ? "uploaded" : "empty",
          files: nextFiles,
        },
      };
    });
    setCategoryError(categoryId, null);
    setIsSaved(false);
    setNotice(null);
  }

  // "해당 문서 없음" 토글
  function toggleMissing(categoryId: string) {
    setStates((prev) => {
      const current = prev[categoryId];
      const nextStatus: DocumentStatus =
        current.status === "missing" ? "empty" : "missing";
      return {
        ...prev,
        [categoryId]: { status: nextStatus, files: [] },
      };
    });
    // 파일 input 값도 초기화
    const input = inputRefs.current[categoryId];
    if (input) input.value = "";
    setCategoryError(categoryId, null);
    setIsSaved(false);
    setNotice(null);
  }

  // 선택한 파일 전체 취소 → 미선택 상태로 되돌린다.
  function clearFiles(categoryId: string) {
    setStates((prev) => ({
      ...prev,
      [categoryId]: { status: "empty", files: [] },
    }));
    const input = inputRefs.current[categoryId];
    if (input) input.value = "";
    setCategoryError(categoryId, null);
    setIsSaved(false);
    setNotice(null);
  }

  // 전체 합계 계산
  const totalUploadSize = documentCategories.reduce((sum, category) => {
    const files = states[category.id]?.files ?? [];
    return sum + files.reduce((inner, file) => inner + file.size, 0);
  }, 0);
  const totalFileCount = documentCategories.reduce((sum, category) => {
    return sum + (states[category.id]?.files.length ?? 0);
  }, 0);

  // 모든 카테고리가 "파일 선택 완료" 또는 "해당 문서 없음" 상태인지 확인
  const allHandled = documentCategories.every(
    (category) => states[category.id].status !== "empty",
  );
  const uploadedCount = documentCategories.filter(
    (category) => states[category.id].status === "uploaded",
  ).length;
  const missingCount = documentCategories.filter(
    (category) => states[category.id].status === "missing",
  ).length;
  const handledCount = uploadedCount + missingCount;
  const progressPercent = Math.round(
    (handledCount / documentCategories.length) * 100,
  );

  function handleAnalyze() {
    if (!allHandled) {
      setNotice(
        "모든 문서 종류에 대해 파일을 선택하거나 ‘해당 문서 없음’을 표시해 주세요.",
      );
      return;
    }

    // sessionStorage에 저장할 메타데이터 구성
    // (실제 File 객체나 파일 내용은 저장하지 않는다.)
    const categories: StoredCategory[] = documentCategories.map((category) => {
      const state = states[category.id];
      const files = state.files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
      return {
        categoryId: category.id,
        categoryName: category.name,
        status: state.status,
        fileNames: files.map((file) => file.name),
        files,
        fileCount: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
      };
    });

    const payload: StoredUpload = {
      categories,
      totalFileCount: categories.reduce((sum, c) => sum + c.fileCount, 0),
      totalUploadSize: categories.reduce((sum, c) => sum + c.totalSize, 0),
    };

    sessionStorage.setItem("boimDocumentUpload", JSON.stringify(payload));
    setIsSaved(true);
    setNotice(null);

    // 저장이 끝나면 합성 분석 진행 화면으로 이동한다.
    router.push(withCompany("/processing", companyId));
  }

  // 상태에 따른 배지 텍스트/스타일
  function statusBadge(categoryId: string) {
    const state = states[categoryId];
    if (state.status === "missing") {
      return { text: "없음", className: "bg-amber-50 text-amber-600" };
    }
    if (state.status === "uploaded") {
      return {
        text: `${state.files.length}개`,
        className: "bg-emerald-50 text-emerald-600",
      };
    }
    return { text: "미선택", className: "bg-zinc-100 text-zinc-400" };
  }

  return (
    <StepShell
      step="Step 03"
      title="내부 문서 업로드"
      description="문서 종류별로 파일을 선택하거나 ‘해당 문서 없음’을 표시해 주세요."
      backTo={withCompany("/visibility", companyId)}
      footer={
        <div className="flex flex-col items-end gap-2">
          {notice && <p className="text-xs text-red-500">{notice}</p>}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!allHandled}
            className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            내부 문서 분석 시작
          </button>
        </div>
      }
    >

      {/* 카테고리 진행 상황 — 문서 순서대로 한 칸씩 채운다.
          업로드 완료 / 해당 문서 없음 / 미선택이 색으로 구분된다. */}
      <div className="rounded-md border border-zinc-100 bg-white px-4 py-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span
            className={`font-mono text-xs font-medium tabular-nums transition-colors duration-500 ${
              handledCount === documentCategories.length
                ? "text-zinc-900"
                : "text-zinc-500"
            }`}
          >
            {progressPercent}%
          </span>
          <span className="text-[11px] text-zinc-400">
            {handledCount}/{documentCategories.length} 항목 완료
          </span>
        </div>

        <div className="flex gap-1.5">
          {documentCategories.map((category) => {
            const status = states[category.id].status;
            const handled = status !== "empty";

            return (
              <div key={category.id} className="flex flex-1 flex-col gap-1.5">
                <div
                  className="h-1.5 overflow-hidden rounded-sm"
                  style={{ backgroundColor: GAUGE_TRACK }}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: handled ? "100%" : "0%",
                      backgroundColor:
                        status === "uploaded" ? GAUGE_UPLOADED : GAUGE_MISSING,
                      transition:
                        "width 420ms cubic-bezier(0.22,0.61,0.36,1), background-color 300ms ease",
                    }}
                  />
                </div>
                <span
                  className={`truncate text-[10px] transition-colors duration-300 ${
                    status === "uploaded"
                      ? "text-zinc-600"
                      : status === "missing"
                        ? "text-zinc-400"
                        : "text-zinc-300"
                  }`}
                >
                  {category.name}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-zinc-100 pt-2.5 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-4 rounded-sm"
              style={{ backgroundColor: GAUGE_UPLOADED }}
            />
            업로드 {uploadedCount}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-4 rounded-sm"
              style={{ backgroundColor: GAUGE_MISSING }}
            />
            해당 문서 없음 {missingCount}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-4 rounded-sm"
              style={{ backgroundColor: GAUGE_TRACK }}
            />
            미선택 {documentCategories.length - handledCount}
          </span>
        </div>
      </div>

      {/* 문서 카테고리 카드 목록 */}
      <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {documentCategories.map((category) => {
          const state = states[category.id];
          const badge = statusBadge(category.id);
          const categorySize = state.files.reduce(
            (sum, file) => sum + file.size,
            0,
          );
          const error = errors[category.id];
          const inputId = `file-${category.id}`;
          const atMax = state.files.length >= MAX_FILES_PER_CATEGORY;

          return (
            <div
              key={category.id}
              className="rounded-lg border border-zinc-100 bg-white"
            >
              {/* 헤더: 문서 종류 + 상태 배지 */}
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                {/* 문서 용도는 물음표에 마우스를 올렸을 때만 보여준다.
                    카드가 3열이라 설명을 항상 펼쳐두면 제목이 밀린다. */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {category.name}
                  </p>
                  <div className="group relative flex items-center">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-400"
                    >
                      ?
                    </span>
                    <span className="sr-only">{category.purpose}</span>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-44 -translate-x-1/2 rounded-md bg-zinc-900 px-3 py-2 text-[11px] leading-5 text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {category.purpose}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                    </div>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium ${badge.className}`}
                >
                  {badge.text}
                </span>
              </div>

              <div className="px-4 py-3">
                {/* 파일 선택 (label과 input을 연결해 접근성 확보) */}
                <label
                  htmlFor={inputId}
                  className={`flex items-center justify-between gap-2 rounded-md border border-dashed px-4 py-3 text-xs transition-colors ${
                    atMax
                      ? "cursor-not-allowed border-zinc-100 text-zinc-300"
                      : "cursor-pointer border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  <span>
                    {atMax
                      ? "최대 5개 도달"
                      : state.files.length > 0
                        ? "파일 더 추가"
                        : "파일 선택"}
                  </span>
                  <span className="text-zinc-300">PDF · PNG · JPG · XLSX</span>
                  <input
                    id={inputId}
                    ref={(el) => {
                      inputRefs.current[category.id] = el;
                    }}
                    type="file"
                    multiple
                    disabled={atMax}
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
                    aria-label={`${category.name} 파일 선택`}
                    onChange={(event) => handleFileChange(category.id, event)}
                    className="hidden"
                  />
                </label>

                {/* 이미지 미리보기 */}
                {state.files.some((file) => file.type.startsWith("image/")) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {state.files
                      .filter((file) => file.type.startsWith("image/"))
                      .map((file, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${file.name}-${index}`}
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="h-10 w-10 rounded object-cover ring-1 ring-zinc-100"
                        />
                      ))}
                  </div>
                )}

                {/* 선택된 파일 목록 */}
                {state.files.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {state.files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-700">
                            {file.name}
                          </p>
                          <p className="font-mono text-[10px] text-zinc-400">
                            {formatBytes(file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(category.id, index)}
                          aria-label={`${file.name} 취소`}
                          className="shrink-0 text-zinc-300 transition-colors hover:text-red-400"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M11 3L3 11M3 3l8 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <p className="px-1 font-mono text-[10px] text-zinc-400">
                      합계 {formatBytes(categorySize)}
                    </p>
                  </div>
                )}

                {/* 카테고리별 오류 메시지 */}
                {error && (
                  <p className="mt-2 text-xs leading-5 text-red-500">{error}</p>
                )}

                {/* 하단 조작 영역: 해당 문서 없음 / 전체 취소 */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <label
                    className={`flex items-center gap-1.5 text-xs ${
                      state.status === "uploaded"
                        ? "cursor-not-allowed text-zinc-300"
                        : "cursor-pointer text-zinc-500"
                    }`}
                    title={
                      state.status === "uploaded"
                        ? "파일을 먼저 전체 취소한 뒤 선택할 수 있습니다."
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={state.status === "missing"}
                      disabled={state.status === "uploaded"}
                      onChange={() => toggleMissing(category.id)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 disabled:cursor-not-allowed"
                    />
                    해당 문서 없음
                  </label>

                  {state.files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFiles(category.id)}
                      className="text-xs text-zinc-400 transition-colors hover:text-red-500"
                    >
                      전체 취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 전체 선택 용량 */}
      <div className="mt-4 flex items-center justify-between rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 font-mono text-xs text-zinc-500">
        <span>파일 {totalFileCount}개</span>
        <span>
          {formatBytes(totalUploadSize)} / {formatBytes(MAX_TOTAL_SIZE)}
        </span>
      </div>

      {/* 저장 완료 메시지 */}
      {isSaved && (
        <p className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-700">
          문서 선택 정보가 저장되었습니다. 분석 진행 화면으로 이동합니다.
        </p>
      )}

    </StepShell>
  );
}
