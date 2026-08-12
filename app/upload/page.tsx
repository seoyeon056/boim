"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { documentCategories } from "@/data/documentCategories";
import type {
  DocumentStatus,
  StoredCategory,
  StoredUpload,
} from "@/types/document";

// ─────────────────────────────────────────────
// 파일 선택 제한값 (실제 서버 업로드는 하지 않지만,
// 실제 서비스와 비슷한 사용자 경험을 위해 미리 검사한다.)
// ─────────────────────────────────────────────
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 파일 한 개 최대 100MB
const MAX_FILES_PER_CATEGORY = 5; // 카테고리당 최대 5개
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 전체 최대 500MB

const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"];
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

// 카테고리별로 화면에서 관리하는 상태
// (실제 File 객체는 오직 이 state 안에서만 관리한다.)
interface CategoryState {
  status: DocumentStatus;
  files: File[];
}

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

export default function UploadPage() {
  const router = useRouter();

  // 모든 카테고리의 초기 상태는 "미선택(empty)"
  const [states, setStates] = useState<Record<string, CategoryState>>(() =>
    Object.fromEntries(
      documentCategories.map((category) => [
        category.id,
        { status: "empty" as DocumentStatus, files: [] as File[] },
      ]),
    ),
  );

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

    const files = Array.from(fileList);

    // 1) 지원하지 않는 형식 검사
    if (files.some((file) => !isAllowedFile(file))) {
      setCategoryError(
        categoryId,
        "지원하지 않는 파일 형식입니다. PDF, PNG, JPG, JPEG 파일을 선택해 주세요.",
      );
      input.value = "";
      return;
    }

    // 2) 카테고리당 최대 개수 검사
    if (files.length > MAX_FILES_PER_CATEGORY) {
      setCategoryError(
        categoryId,
        "한 문서 종류에는 최대 5개의 파일을 선택할 수 있습니다.",
      );
      input.value = "";
      return;
    }

    // 3) 파일 한 개 최대 크기 검사
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setCategoryError(
        categoryId,
        "파일 한 개는 최대 100MB까지 선택할 수 있습니다. 용량이 큰 문서는 연도별 또는 분기별로 나누어 선택하는 것을 권장합니다.",
      );
      input.value = "";
      return;
    }

    // 4) 전체 선택 용량 검사
    const newCategorySize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSizeExcluding(categoryId) + newCategorySize > MAX_TOTAL_SIZE) {
      setCategoryError(
        categoryId,
        "전체 파일 크기는 최대 500MB까지 선택할 수 있습니다.",
      );
      input.value = "";
      return;
    }

    // 검사를 모두 통과: 새 선택 결과로 교체하고 상태를 uploaded로 바꾼다.
    // (파일을 선택하면 "해당 문서 없음" 상태는 자동으로 해제된다.)
    setStates((prev) => ({
      ...prev,
      [categoryId]: { status: "uploaded", files },
    }));
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
    router.push("/processing");
  }

  // 상태에 따른 배지 텍스트/스타일
  function statusBadge(category: (typeof documentCategories)[number]) {
    const state = states[category.id];
    if (state.status === "missing") {
      return { text: "해당 문서 없음", className: "bg-amber-50 text-amber-700" };
    }
    if (state.status === "uploaded") {
      return {
        text: `파일 ${state.files.length}개 선택 완료`,
        className: "bg-blue-50 text-blue-700",
      };
    }
    return { text: "미선택", className: "bg-zinc-100 text-zinc-500" };
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/visibility"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 이전으로
        </Link>

        <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
          <p className="text-sm font-semibold text-blue-600">STEP 3</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            내부 문서 업로드
          </h1>
          <p className="text-base leading-7 text-zinc-500">
            문서 종류별로 보유한 내부 문서를 선택하거나 ‘해당 문서 없음’을
            표시해 주세요.
          </p>
        </main>

        {/* 상단 안내 */}
        <div className="mt-8 rounded-2xl bg-red-50 p-5 text-sm leading-6 text-red-700">
          <p className="font-semibold">
            현재 공모전 시연 버전에서는 실제 기업 문서나 개인정보를 업로드하지
            마세요.
          </p>
          <p className="mt-2">합성 문서만 사용해 주세요.</p>
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-700">
          <p>
            실제 서비스에서는 기업이 공개 범위를 직접 정하며, 거래처명과 민감
            정보는 마스킹할 수 있습니다.
          </p>
          <p className="mt-2">
            한 파일에 여러 달 또는 여러 연도의 문서가 포함되어 있어도 됩니다.
            용량이 큰 문서는 연도별 또는 분기별로 나누어 선택하면 더 안정적으로
            분석할 수 있습니다.
          </p>
        </div>

        {/* 문서 카테고리 카드 목록 */}
        <div className="mt-8 flex flex-col gap-5">
          {documentCategories.map((category) => {
            const state = states[category.id];
            const badge = statusBadge(category);
            const categorySize = state.files.reduce(
              (sum, file) => sum + file.size,
              0,
            );
            const error = errors[category.id];
            const inputId = `file-${category.id}`;

            return (
              <div
                key={category.id}
                className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm"
              >
                {/* 헤더: 문서 종류 + 상태 배지 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-bold text-zinc-900">
                      {category.name}
                    </h2>
                    <p className="text-sm leading-6 text-zinc-500">
                      {category.purpose}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                </div>

                {/* 파일 선택 버튼 (label과 input을 연결해 접근성 확보) */}
                <label
                  htmlFor={inputId}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="text-base font-semibold text-zinc-800">
                    {category.name} 파일 선택
                  </span>
                  <span className="text-sm text-zinc-500">
                    클릭하여 파일을 선택하세요 (여러 개 선택 가능)
                  </span>
                  <span className="mt-1 text-xs text-zinc-400">
                    최대 5개 · 파일당 최대 100MB · PDF, PNG, JPG, JPEG
                  </span>
                  <input
                    id={inputId}
                    ref={(el) => {
                      inputRefs.current[category.id] = el;
                    }}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    aria-label={`${category.name} 파일 선택`}
                    onChange={(event) => handleFileChange(category.id, event)}
                    className="hidden"
                  />
                </label>

                {/* 선택된 파일 목록 + 개수 + 합계 용량 */}
                {state.status === "uploaded" && state.files.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm">
                    <ul className="flex flex-col gap-1">
                      {state.files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex justify-between gap-3 text-zinc-700"
                        >
                          <span className="min-w-0 break-all font-medium text-zinc-900">
                            {file.name}
                          </span>
                          <span className="shrink-0 text-zinc-500">
                            {formatBytes(file.size)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-between gap-3 border-t border-zinc-200 pt-2 text-zinc-500">
                      <span>파일 {state.files.length}개</span>
                      <span>합계 {formatBytes(categorySize)}</span>
                    </div>
                  </div>
                )}

                {/* 카테고리별 오류 메시지 */}
                {error && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">
                    {error}
                  </p>
                )}

                {/* 하단 조작 영역: 해당 문서 없음 / 전체 취소 */}
                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={state.status === "missing"}
                      onChange={() => toggleMissing(category.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                    />
                    해당 문서 없음
                  </label>

                  {state.files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFiles(category.id)}
                      className="text-sm font-medium text-zinc-500 transition-colors hover:text-red-600"
                    >
                      선택한 파일 전체 취소
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 전체 선택 용량 */}
        <div className="mt-6 flex flex-col gap-2 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-zinc-500">전체 선택 용량</span>
            <span className="text-base font-semibold text-zinc-900">
              {formatBytes(totalUploadSize)} / {formatBytes(MAX_TOTAL_SIZE)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-zinc-500">전체 선택 파일</span>
            <span className="text-base font-semibold text-zinc-900">
              {totalFileCount}개
            </span>
          </div>
        </div>

        {/* 미선택 카테고리 안내 */}
        {!allHandled && (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium leading-6 text-amber-700">
            모든 문서 종류에 대해 파일을 선택하거나 ‘해당 문서 없음’을 표시해
            주세요.
          </p>
        )}

        {/* 저장 완료 메시지 */}
        {isSaved && (
          <div className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-semibold leading-6 text-blue-700">
            <p>문서 선택 정보가 저장되었습니다.</p>
            <p className="mt-1 font-medium">
              다음 단계에서 분석 진행 화면을 연결합니다.
            </p>
          </div>
        )}

        {/* 그 외 안내(예: 버튼 눌렀지만 미완료) */}
        {notice && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold leading-6 text-red-700">
            {notice}
          </p>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!allHandled}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          내부 문서 분석 시작
        </button>
      </div>
    </div>
  );
}
