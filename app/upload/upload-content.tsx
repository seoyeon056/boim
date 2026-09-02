"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { documentCategories } from "@/data/documentCategories";
import type {
  DocumentCategory,
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
const GAUGE_UPLOADED = "#1D4533";
const GAUGE_MISSING = "#BCB0A9";
const GAUGE_TRACK = "#E9E2DD";

// 시연용 샘플 문서. public/sample 에 실제 파일로 들어 있고, 손으로 올린 파일과
// 똑같은 인식 경로를 그대로 탄다. 결과를 미리 심어 두지 않는다.
//
// 거래명세서는 2026년 열두 달치다. 한 달치만 넣으면 관측 기간이 짧아
// lib/signals.ts 가 "데이터 부족"으로 판정하고 등급이 안 나온다(실제로 그렇다).
// 전부 채우면 거래처 7곳 · 거래 95건 · 열두 달이 나온다.
//
//   거래명세서 4개  72건  미래모터스·대성테크·한울전자·동방정공 각 18
//   입금내역        22건  위 4곳 각 4 + 새봄테크 3 + 한울부품 3
//   세금계산서 PDF   1건  한빛금속
//
// 화면 안내 문구도 이 숫자를 적는다. **추출 결과가 달라지면 아래 문구를 같이
// 고쳐야 한다.** 두 번 어긋났다. 처음엔 샘플 파일이 바뀌었는데 문구가 안 따라가
// "6곳·6개월·21건"으로 남았고(실측 5곳·12개월·73건), 다음엔 입금내역을 읽도록
// 고치면서 73건이 95건이 됐는데 문구가 그대로였다. 안내와 실제가 다르면
// 값이 틀린 것보다 나쁘다 — 화면이 하는 말을 못 믿게 된다.
const SAMPLE_FILES: { category: string; names: string[] }[] = [
  {
    category: "transaction-statement",
    names: [
      "거래명세서_202608.xlsx",
      "거래명세서_대성테크_2026상반기.xlsx",
      "거래명세서_한울전자_2026상반기.xlsx",
      "거래명세서_동방정공_2026하반기.xlsx",
    ],
  },
  {
    // 스캔본이라 브라우저 OCR 경로를 탄다. 인식이 잘 안 되어도 위 엑셀에서
    // 거래가 이미 나오므로 화면이 비지 않는다.
    category: "tax-invoice",
    names: ["전자세금계산서_202608.pdf", "기업_내부거래_데모데이터_1장.pdf"],
  },
  {
    // 명세서에 없는 거래처의 입금이라 중복 없이 거래가 늘어난다.
    // (중복 제거 기준은 날짜+금액+품목이다 — run-local-ocr.ts 의 dedupe)
    category: "deposit-history",
    names: ["입금내역_2026상반기.xlsx"],
  },
  { category: "quotation", names: ["견적서_EST202608.xlsx"] },
  {
    // 지금은 엔진이 읽지 않는 칸이지만, 나중에 연결해도 그대로 읽히도록
    // 발주일자·품목·발주금액 열을 갖춰 두었다(확인함: 2건 · 납기 2026-10-15).
    category: "purchase-order",
    names: ["발주서_2026Q3.xlsx"],
  },
  { category: "contract", names: ["표준소프트웨어라이선스계약서.pdf"] },
];

function mimeOf(name: string): string {
  if (name.toLowerCase().endsWith(".pdf")) return "application/pdf";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

// 문서를 두 묶음으로 나눈다. 여섯 개를 한 줄로 늘어놓으면 어디부터 손대야
// 할지 알 수 없다. 중요도가 아니라 문서가 말해 주는 시점이 다르다.
//   거래 실적 — 이미 일어난 거래.   성장 신호를 여기서 계산한다.
//   거래 흐름 — 예정된 거래와 조건. 진단서에 근거 자료로 함께 싣는다.
const RECORD_CATEGORIES = documentCategories.filter((c) => c.analyzed);
const FLOW_CATEGORIES = documentCategories.filter((c) => !c.analyzed);

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

  // 파일을 끌어다 올린 카테고리 (테두리 강조용)
  const [dragOver, setDragOver] = useState<Record<string, boolean>>({});

  // 저장 완료 여부 / 하단 안내 메시지
  const [isSaved, setIsSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

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

  // 파일 선택(input)과 드래그 앤 드롭이 같은 검사를 거치도록 한곳에 모았다.
  // inputEl 은 드롭으로 들어온 경우 null 이다.
  function addFiles(
    categoryId: string,
    fileList: FileList | File[] | null,
    inputEl: HTMLInputElement | null,
  ) {
    const input = inputEl ?? { value: "" };

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
  function handleFileChange(
    categoryId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    addFiles(categoryId, event.target.files, event.target);
  }

  function setDragging(categoryId: string, on: boolean) {
    setDragOver((prev) => (prev[categoryId] === on ? prev : { ...prev, [categoryId]: on }));
  }

  function handleDrop(categoryId: string, event: React.DragEvent) {
    event.preventDefault();
    setDragging(categoryId, false);
    if (states[categoryId].files.length >= MAX_FILES_PER_CATEGORY) return;
    addFiles(categoryId, event.dataTransfer?.files ?? null, null);
  }

  // 목록의 파일 이름을 누르면 그 파일을 그대로 내려받는다. 샘플이든 직접 올린
  // 파일이든 메모리에 실제 File 로 들고 있어서, 열어 보고 내용을 확인할 수 있다.
  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 브라우저가 내려받기를 시작할 틈을 준 뒤 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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

  // 아직 손대지 않은 칸을 전부 "해당 문서 없음"으로 넘긴다.
  // 여섯 칸을 하나씩 체크하는 클릭이 시연에서 제일 거슬리는 부분이었다.
  function markRestMissing() {
    setStates((prev) => {
      const next = { ...prev };
      for (const category of documentCategories) {
        if (next[category.id].status === "empty") {
          next[category.id] = { status: "missing", files: [] };
        }
      }
      return next;
    });
    setIsSaved(false);
    setNotice(null);
  }

  // 샘플 거래명세서를 불러온다. 손으로 올린 파일과 같은 경로를 타므로
  // 인식·추출·계산이 전부 실제로 돈다.
  async function loadSampleDocuments() {
    setIsLoadingSample(true);
    try {
      const loaded = await Promise.all(
        SAMPLE_FILES.map(async ({ category, names }) => ({
          category,
          files: await Promise.all(
            names.map(async (name) => {
              const response = await fetch(
                `/sample/${encodeURIComponent(name)}`,
              );
              if (!response.ok) {
                throw new Error(name);
              }
              return new File([await response.blob()], name, {
                type: mimeOf(name),
              });
            }),
          ),
        })),
      );

      setStates((prev) => {
        const next = { ...prev };
        // 샘플에 없는 칸은 없는 것으로 둔다. 한 번 누르면 바로 다음 단계로
        // 갈 수 있어야 시연이 끊기지 않는다.
        for (const category of documentCategories) {
          next[category.id] = { status: "missing", files: [] };
        }
        for (const { category, files } of loaded) {
          next[category] = { status: "uploaded", files };
        }
        return next;
      });
      setErrors({});
      setIsSaved(false);
      setNotice(null);
    } catch {
      setNotice("샘플 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoadingSample(false);
    }
  }

  // 전체 합계 계산
  const totalUploadSize = documentCategories.reduce((sum, category) => {
    const files = states[category.id]?.files ?? [];
    return sum + files.reduce((inner, file) => inner + file.size, 0);
  }, 0);
  const totalFileCount = documentCategories.reduce((sum, category) => {
    return sum + (states[category.id]?.files.length ?? 0);
  }, 0);

  // 분석에 쓰이는 문서 세 칸만 정해지면 다음 단계로 넘어간다.
  // 참고 자료는 비워 둬도 진단이 끝나므로 진행을 막지 않는다.
  const analyzedHandled = RECORD_CATEGORIES.filter(
    (category) => states[category.id].status !== "empty",
  ).length;
  const allHandled = analyzedHandled === RECORD_CATEGORIES.length;
  const hasUntouched = documentCategories.some(
    (category) => states[category.id].status === "empty",
  );
  const uploadedCount = documentCategories.filter(
    (category) => states[category.id].status === "uploaded",
  ).length;

  async function handleAnalyze() {
    if (!allHandled) {
      setNotice(
        "거래명세서·세금계산서·입금내역에 파일을 선택하거나 ‘해당 문서 없음’을 표시해 주세요.",
      );
      return;
    }

    setIsAnalyzing(true);

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

    // 인식은 다음 화면(/processing)에서 한다. 파일은 UploadStoreProvider가
    // 들고 있어서 라우트를 옮겨도 살아 있고, 진행률을 실제 인식 진척으로
    // 보여줄 수 있다. 여기서 돌리면 사용자가 빈 화면에서 기다리게 된다.
    sessionStorage.removeItem("boimExtractedTransactions");
    sessionStorage.removeItem("boimExtractionOutcome");

    setIsSaved(true);
    setNotice(null);

    // 저장이 끝나면 분석 진행 화면으로 이동한다.
    router.push(withCompany("/processing", companyId));
  }

  // 카드 한 장. 분석에 쓰이는 문서와 참고 자료가 같은 모양을 공유한다.
  function renderCategoryCard(category: DocumentCategory) {
          const state = states[category.id];
          const badge = statusBadge(category.id);
          const categorySize = state.files.reduce(
            (sum, file) => sum + file.size,
            0,
          );
          const error = errors[category.id];
          const inputId = `file-${category.id}`;
          const atMax = state.files.length >= MAX_FILES_PER_CATEGORY;
          const isDragging = dragOver[category.id] === true && !atMax;

          // 파일이 들어오면 카드 전체가 초록으로 물든다. 배지 하나만 바뀌면
          // 무엇이 채워졌는지 한눈에 안 들어온다.
          const filled = state.status === "uploaded";
          const skipped = state.status === "missing";

          return (
            <div
              key={category.id}
              className={`rounded-lg transition-all duration-500 ${
                filled
                  ? "border border-[#C8D7C6] bg-[#F4F8F4] shadow-[0_1px_3px_rgba(29,69,51,0.06)]"
                  : skipped
                    ? "border border-zinc-100 bg-zinc-50/60"
                    : category.primary
                      ? "border-2 border-zinc-300 bg-white hover:border-zinc-500"
                      : "border border-zinc-100 bg-white hover:border-zinc-200"
              }`}
            >
              {/* 헤더: 문서 종류 + 상태 배지 */}
              <div
                className={`flex items-start justify-between gap-3 border-b px-4 py-3 transition-colors duration-500 ${
                  filled ? "border-[#DCE7DC]" : "border-zinc-100"
                }`}
              >
                {/* 문서 용도는 물음표에 마우스를 올렸을 때만 보여준다.
                    카드가 3열이라 설명을 항상 펼쳐두면 제목이 밀린다. */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] font-semibold text-zinc-900">
                    {category.name}
                  </p>
                  <div className="group relative flex items-center">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500"
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
                {badge && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[12px] font-medium transition-colors duration-500 ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                )}
              </div>

              <div className="px-4 py-3">
                {/* 파일 선택 (label과 input을 연결해 접근성 확보) */}
                <label
                  htmlFor={inputId}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(category.id, true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(category.id, true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(category.id, false);
                  }}
                  onDrop={(event) => handleDrop(category.id, event)}
                  className={`flex items-center justify-between gap-2 rounded-md border border-dashed px-4 py-3 text-xs transition-colors ${
                    atMax
                      ? "cursor-not-allowed border-zinc-100 text-zinc-300"
                      : isDragging
                        ? "cursor-copy border-zinc-900 bg-zinc-50 text-zinc-900"
                        : "cursor-pointer border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  <span>
                    {atMax
                      ? "최대 5개 도달"
                      : isDragging
                        ? "여기에 놓으면 첨부됩니다"
                        : state.files.length > 0
                          ? "파일 더 추가"
                          : "파일 선택"}
                  </span>
                  <span className="text-zinc-400">PDF · PNG · JPG · XLSX</span>
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
                          <button
                            type="button"
                            onClick={() => downloadFile(file)}
                            title="파일 내려받아 확인"
                            className="flex w-full items-center gap-1 text-left"
                          >
                            <span className="truncate text-xs font-medium text-zinc-700 underline decoration-zinc-300 decoration-dotted underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-500">
                              {file.name}
                            </span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 14 14"
                              fill="none"
                              aria-hidden="true"
                              className="shrink-0 text-zinc-300"
                            >
                              <path
                                d="M7 2v7m0 0l3-3m-3 3L4 6M2.5 11.5h9"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <p className="font-mono text-[11px] text-zinc-400">
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
                    <p className="px-1 font-mono text-[11px] text-zinc-400">
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
  }

  // 상태에 따른 배지 텍스트/스타일
  // 배지는 세 가지다. 비어 있을 때 "미선택"이라고 붙이면 못 끝낸 일처럼
  // 읽혀서, 그때는 아무 말도 하지 않는다.
  function statusBadge(categoryId: string) {
    const state = states[categoryId];
    if (state.status === "missing") {
      return { text: "없음", className: "bg-zinc-100 text-zinc-500" };
    }
    if (state.status === "uploaded") {
      return {
        text: `${state.files.length}개`,
        className: "bg-[#E3EBE4] text-[#1D4533]",
      };
    }
    return null;
  }

  return (
    <StepShell
      step="Step 03"
      title="내부 문서 업로드"
      description="거래명세서 하나만 있어도 진단이 됩니다. 가지고 계신 것만 올리세요."
      backTo={withCompany("/visibility", companyId)}
      companyId={companyId}
      footer={
        <div className="flex flex-col items-end gap-2">
          {notice && <p className="text-xs text-red-500">{notice}</p>}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!allHandled || isAnalyzing}
            className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            {isAnalyzing ? "문서 확인 중…" : "내부 문서 분석 시작"}
          </button>
        </div>
      }
    >

      {/* 문서를 준비하지 못한 자리에서도 흐름을 끝까지 보여 줄 수 있어야 한다.
          샘플은 public/sample 의 실제 엑셀이고, 손으로 올린 파일과 같은 인식
          경로를 그대로 탄다. 결과를 미리 심어 두지 않는다. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3.5">
        <button
          type="button"
          onClick={loadSampleDocuments}
          disabled={isLoadingSample}
          className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {isLoadingSample ? "불러오는 중…" : "샘플 문서 불러오기"}
        </button>
        <button
          type="button"
          onClick={markRestMissing}
          disabled={!hasUntouched}
          className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 px-4 text-[13px] font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:text-zinc-300"
        >
          나머지 모두 없음으로 표시
        </button>
        <span className="text-[13px] text-zinc-500">
          문서가 없어도 괜찮습니다. 샘플로 거래처 7곳·12개월치 거래 95건을
          실제로 분석해 볼 수 있습니다.
        </span>
      </div>

      {/* 카테고리 진행 상황.
          퍼센트와 "N/6 항목 완료"를 나란히 두면 채워야 할 진도표처럼 읽혔다.
          지금 무엇이 준비됐는지만 말하고, 몇 개가 남았는지는 세지 않는다. */}
      <div className="rounded-md border border-zinc-100 bg-white px-4 py-3.5">
        <div className="mb-2.5 flex items-center gap-1.5">
          <span className="text-[13px] text-zinc-600">
            {uploadedCount > 0 ? "파일 준비 완료" : "문서 준비 현황"}
          </span>
          {allHandled && (
            <span className="flex items-center gap-1 text-[13px] text-[#1D4533]">
              <span aria-hidden className="text-zinc-300">,</span>
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M3 8.5l3 3 7-7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              분석 가능
            </span>
          )}
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
                  className={`truncate text-[13px] transition-colors duration-300 ${
                    status === "uploaded"
                      ? "text-zinc-700"
                      : status === "missing"
                        ? "text-zinc-500"
                        : "text-zinc-400"
                  }`}
                >
                  {category.name}
                </span>
              </div>
            );
          })}
        </div>

      </div>

      {/* ── 두 묶음을 접지 않고 나란히 둔다 ────────────────
          접어 두면 "열어서 채워야 할 게 또 있다"로 읽힌다. 전부 보이되
          채운 칸과 빈 칸이 색으로 갈리게 해서, 목록이 아니라 진행 상태로
          보이게 한다. */}
      <div className="mt-7">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">거래 실적</h2>
          <span className="text-[13px] text-zinc-500">
            이미 일어난 거래입니다. 성장 신호를 여기서 계산합니다
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {RECORD_CATEGORIES.map(renderCategoryCard)}
        </div>
      </div>

      <div className="mt-7">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">거래 흐름</h2>
          <span className="text-[13px] text-zinc-500">
            앞으로 일어날 거래와 그 조건입니다. 진단서에 근거로 함께 실립니다
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {FLOW_CATEGORIES.map(renderCategoryCard)}
        </div>
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
