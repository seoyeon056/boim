"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import {
  readUploadSnapshot,
  serverUploadSnapshot,
  subscribeUpload,
  uploadedCategoryNames,
} from "@/lib/uploaded-documents";
import Link from "next/link";

import {
  fetchDiagnosis,
  fetchVisibility,
  type SignalsResult,
  type VisibilityResult,
} from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import { isSampleUpload } from "@/lib/uploaded-documents";
import { buildDiagnosis } from "@/lib/diagnosis";
import { calculateSignals } from "@/lib/signals";
import {
  readSettlementSummary,
  readUploadedSignals,
} from "@/lib/uploaded-signals";
import { restoreCustomerName } from "@/lib/llm/customer-mask";
import { grantAiConsent, hasAiConsent } from "@/lib/ai-consent";

// LLM에 넘길 판정 표기. 화면의 "긍정/주의"와 같은 말을 쓴다.
const STATUS_TEXT = { positive: "긍정", neutral: "보통", caution: "주의" } as const;

// 거래 실적이 없을 때 쓰는 빈 신호. 모든 지표가 "—", 등급은 산정 불가.
const EMPTY_SIGNALS = calculateSignals([]);

// 공문서 양식의 최종 진단서.
// 기업명·점수·성장 신호는 모두 진단 중인 기업에 맞춰 읽어온다. 전부 준비되기
// 전에는 로딩 상태를 보여주고, 인쇄/PDF 버튼도 그동안 비활성화한다.
//
// 분석 기간은 계산 결과(signals.periodStart/End)에서 가져온다. 예전에는
// "2026년 01월 – 2026년 06월" 문자열을 박아 두어, 어떤 문서를 올려도 이 기간이
// 찍혔다.
const PERIOD_UNKNOWN = "확인된 거래 없음";

function periodOf(values: SignalsResult | null): string {
  if (!values?.periodStart || !values.periodEnd) {
    return PERIOD_UNKNOWN;
  }
  return values.periodStart === values.periodEnd
    ? values.periodStart
    : `${values.periodStart} – ${values.periodEnd}`;
}

// 진단서 본문 서체. 나눔명조는 획이 굵고 예스러워 문서가 무거워 보인다.
// Noto Serif KR 은 획이 가늘고 자간이 정돈돼 있어 같은 문서 톤을 유지하면서 덜 튄다.
const serif = {
  fontFamily: "var(--font-document)",
  fontWeight: 400,
  letterSpacing: "0.01em",
} as const;

const wonText = (amount: number): string => {
  if (amount >= 100000000) return (amount / 100000000).toFixed(1) + "억";
  if (amount >= 10000) return Math.round(amount / 10000).toLocaleString() + "만";
  return amount.toLocaleString();
};

export function ShareContent({
  companyId,
  issuedAt,
  docNo,
}: {
  companyId?: string;
  issuedAt: string;
  docNo: string;
}) {
  const [visibility, setVisibility] = useState<VisibilityResult | null>(null);
  // 업로드·검수한 거래는 브라우저(sessionStorage)에만 있고 서버는 못 본다.
  // 첫 클라이언트 렌더에서 한 번 읽는다(effect 안에서 setState 하지 않는다).
  const [uploaded] = useState(() => readUploadedSignals(companyId ?? ""));
  const [settlement] = useState(() => readSettlementSummary());

  const signals: SignalsResult = uploaded ? uploaded.signals : EMPTY_SIGNALS;
  const hasData = Boolean(uploaded);
  const uploadedCount = uploaded ? uploaded.transactionCount : 0;
  const futureExcludedCount = uploaded ? uploaded.futureExcludedCount : 0;
  // 분석 기간은 실제 계산에 쓴 거래에서 나온다(signals.periodStart/End).
  const period = periodOf(uploaded ? uploaded.signals : null);

  // 업로드 내역은 브라우저(sessionStorage)에만 있다. Step 05의 근거 문서
  // 목록과 같은 기록을 읽는다.
  const upload = useSyncExternalStore(
    subscribeUpload,
    readUploadSnapshot,
    serverUploadSnapshot,
  );
  const evidenceDocs = uploadedCategoryNames(upload);
  const sampleBased = isSampleUpload(upload);
  const [loadFailed, setLoadFailed] = useState(false);
  // LLM이 쓴 종합 진단. 도착 전이거나 실패하면 규칙 기반 문장(가/나/다)을 쓴다.
  const [llmDiagnosis, setLlmDiagnosis] = useState<string | null>(null);
  const [llmState, setLlmState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    let isActive = true;

    const effective = uploaded ? uploaded.signals : EMPTY_SIGNALS;

    fetchVisibility(companyId)
      .then((visibilityResult) => {
        if (!isActive) return;
        setVisibility(visibilityResult);

        // Step 05에서 이미 동의했고, 산정된 거래가 있을 때만 AI 종합 의견을 부른다.
        if (!uploaded || !hasAiConsent()) {
          return;
        }

        setLlmState("loading");
        return runDiagnosis(
          visibilityResult,
          effective,
          uploaded.transactionCount,
        )
          .then((text) => {
            if (isActive && text) setLlmDiagnosis(text);
            if (isActive) setLlmState("idle");
          })
          .catch(() => {
            if (isActive) setLlmState("failed");
          });
      })
      .catch(() => {
        if (!isActive) return;
        setVisibility(null);
        setLoadFailed(true);
      });

    return () => {
      isActive = false;
    };
  }, [companyId, uploaded]);

  // 지표와 신호를 받아 종합 의견 문장을 만든다. 자동 생성과 버튼이 같은 경로를 쓴다.
  async function runDiagnosis(
    view: VisibilityResult,
    values: SignalsResult,
    count: number,
  ): Promise<string> {
    const { diagnosis: text } = await fetchDiagnosis({
      period: periodOf(values),
      transactionCount: count,
      visibilityScore: view.visibilityScore,
      visibilityInterpretation: view.interpretations.visibility,
      newsCount: view.newsCount,
      newsCountIsAtLeast: view.newsCountIsAtLeast,
      patentCount: view.patentCount,
      patentCountIsAtLeast: view.patentCountIsAtLeast,
      employeeCount: view.employeeCount,
      disclosureCount: view.disclosureCount,
      unavailable: view.unavailable,
      customerGrowthRate: values.customerGrowthRate,
      previousCustomersCount: values.previousCustomersCount,
      recentCustomersCount: values.recentCustomersCount,
      growthStatus: STATUS_TEXT[values.statuses.customerGrowthRate],
      repeatPurchaseRate: values.repeatPurchaseRate,
      repeatStatus: STATUS_TEXT[values.statuses.repeatPurchaseRate],
      topCustomerConcentration: values.topCustomerConcentration,
      concentrationStatus: STATUS_TEXT[values.statuses.topCustomerConcentration],
    });
    return restoreCustomerName(text.trim(), values.topCustomerName);
  }

  // AI 종합 의견은 기본으로 부르지 않는다. 이 수치는 사용자가 올린 문서에서 나온
  // 값이라, 외부 모델로 보낼지를 사용자가 정하게 한다.
  async function requestLlmDiagnosis() {
    if (!visibility || !signals || !hasData) return;
    grantAiConsent();
    setLlmState("loading");
    try {
      setLlmDiagnosis(
        await runDiagnosis(visibility, signals, uploadedCount),
      );
      setLlmState("idle");
    } catch {
      setLlmState("failed");
    }
  }

  // 기업명·점수가 준비되기 전까지는 로딩 상태만 보여준다(성장 신호는 이미 있다).
  const ready = visibility !== null;

  if (!ready) {
    return (
      <div
        className="report-page flex min-h-screen items-center justify-center print:min-h-0"
        style={{ backgroundColor: "#E9E2DD" }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {loadFailed ? (
            <>
              <p className="text-sm text-zinc-700">
                기업 정보를 불러오지 못해 진단서를 완성할 수 없습니다.
              </p>
              <Link
                href={withCompany("/compare", companyId)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                이전으로 돌아가기
              </Link>
            </>
          ) : (
            <>
              <span
                aria-hidden
                className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"
              />
              <p className="text-sm text-zinc-600">
                진단서를 준비하는 중입니다…
              </p>
              <p className="text-xs text-zinc-500">
                기업 정보와 성장 신호가 모두 준비되면 표시됩니다.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const diagnosis = buildDiagnosis(visibility, signals);
  const grade = hasData ? diagnosis.grade : "산정 불가";
  const companyName = visibility.company || "확인되지 않은 기업";
  const periodValue = hasData ? period : "거래 실적 문서 없음";

  const infoRows: { label: string; value: string }[][] = [
    [
      { label: "기 업 명", value: companyName },
      { label: "분석 기간", value: periodValue },
    ],
    [
      {
        label: "외부 가시성 점수",
        value: `${visibility.visibilityScore}점 / 100점`,
      },
      { label: "성장 잠재력 등급", value: grade },
    ],
    [
      { label: "분석 기관", value: "BO:IM AI 진단 시스템" },
      { label: "발 행 일", value: issuedAt },
    ],
  ];

  // 판정(긍정/주의)은 lib/signals.ts 계산 결과를 그대로 쓴다.
  const growthSignals = hasData
    ? signals.signals.map((item, index) => ({
        no: String(index + 1),
        label: item.label,
        // 표본이 모자라 판정하지 않은 지표는 수치를 적지 않는다.
        value: item.evaluable
          ? `${item.prefix}${item.value}${item.suffix}`
          : "—",
        tone: item.tone,
        evaluable: item.evaluable,
        note: item.detail,
      }))
    : [];

  return (
    <div
      className="report-page min-h-screen print:min-h-0"
      style={{ backgroundColor: "#E9E2DD" }}
    >
      <div className="mx-auto w-full max-w-[840px] px-6 py-12 print:max-w-full print:px-0 print:py-0">
      {/* 화면 전용 네비 */}
      <div className="print:hidden">
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          ← 이전으로
        </Link>
      </div>

      {/* ───── 문서 본체 ───── */}
      <div
        className="report-sheet mt-8 bg-white px-12 py-10 print:mt-0 print:border-0 print:px-0 print:shadow-none"
        style={{
          ...serif,
          boxShadow:
            "0 1px 2px rgba(27,25,23,0.06), 0 12px 32px rgba(27,25,23,0.10)",
        }}
      >
        {/* 발신 기관 · 문서번호 */}
        <div className="flex items-end justify-between">
          <p className="font-mono text-[11px] font-bold tracking-[0.35em] text-zinc-900">
            BO:IM
          </p>
          <div className="text-right text-[11px] leading-5 text-zinc-600">
            <p>
              문서번호 <span className="font-mono">{docNo}</span>
            </p>
            <p>시행일자 {issuedAt}</p>
          </div>
        </div>

        {/* 표제 */}
        <div className="mt-8 border-y-[3px] border-double border-zinc-900 py-6 text-center">
          <h1 className="text-[26px] font-medium tracking-[0.32em] text-zinc-900">
            기업성장진단보고서
          </h1>
          {hasData && (
            <p className="mt-2 text-[12px] tracking-[0.2em] text-zinc-500">
              {period.replace("–", "~")}
            </p>
          )}
          {sampleBased && (
            <p className="mt-2 text-[11px] tracking-[0.1em] text-amber-700">
              ※ 본 보고서는 샘플 데이터(예시) 기반이며 실제 기업 데이터가 아닙니다.
            </p>
          )}
        </div>

        {/* 수신 · 제목 */}
        <div className="mt-6 space-y-1.5 text-[13px] leading-6 text-zinc-900">
          <p>
            <span className="inline-block w-16 text-zinc-500">수　신</span>
            {companyName} 대표 귀하
          </p>
          <p>
            <span className="inline-block w-16 text-zinc-500">제　목</span>
            {companyName} 내·외부 데이터 기반 성장 진단 결과 통보
          </p>
        </div>

        {/* 1. 기본 사항 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-medium text-zinc-900">
            1. 기본 사항
          </h2>
          <table className="w-full border-collapse border border-zinc-900 text-[13px]">
            <tbody>
              {infoRows.map((row) => (
                <tr key={row[0].label}>
                  {row.map((cell) => (
                    <Fragment key={cell.label}>
                      <th className="w-[22%] border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-left text-[12px] font-medium text-zinc-500">
                        {cell.label}
                      </th>
                      <td className="w-[28%] border border-zinc-300 px-3 py-2.5 font-medium text-zinc-900">
                        {cell.value}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 2. 내부 성장 신호 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-medium text-zinc-900">
            2. 내부 성장 신호
          </h2>
          <table className="w-full border-collapse border border-zinc-900 text-[13px]">
            <thead>
              <tr className="bg-zinc-100">
                <th className="w-10 border border-zinc-300 py-2 text-[12px] font-medium text-zinc-500">
                  연번
                </th>
                <th className="border border-zinc-300 py-2 text-[12px] font-medium text-zinc-500">
                  지　표
                </th>
                <th className="w-24 border border-zinc-300 py-2 text-[12px] font-medium text-zinc-500">
                  수　치
                </th>
                <th className="w-16 border border-zinc-300 py-2 text-[12px] font-medium text-zinc-500">
                  판정
                </th>
                <th className="w-[34%] border border-zinc-300 py-2 text-[12px] font-medium text-zinc-500">
                  비　고
                </th>
              </tr>
            </thead>
            <tbody>
              {growthSignals.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-zinc-300 py-4 text-center text-[12px] text-zinc-500"
                  >
                    제출된 거래 실적 문서가 없어 내부 성장 신호를 산정하지
                    못했습니다.
                  </td>
                </tr>
              ) : (
                growthSignals.map((signal) => (
                  <tr key={signal.label}>
                    <td className="border border-zinc-300 py-2.5 text-center text-[12px] tabular-nums text-zinc-500">
                      {signal.no}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2.5 font-medium text-zinc-900">
                      {signal.label}
                    </td>
                    <td className="border border-zinc-300 py-2.5 text-center text-[17px] font-medium tabular-nums text-zinc-900">
                      {signal.value}
                    </td>
                    <td className="border border-zinc-300 py-2.5 text-center text-[12px] font-bold text-zinc-900">
                      {signal.evaluable ? STATUS_TEXT[signal.tone] : "판단 보류"}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2.5 text-[12px] text-zinc-600">
                      {signal.note}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* 이 표의 수치가 무엇에서 나왔는지 밝힌다. 실제 계산에 쓴 거래 건수를 적는다. */}
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
            {hasData
              ? `※ 위 수치는 제출된 거래명세서·세금계산서에서 확인된 거래 ${uploadedCount}건을 근거로 산출되었습니다.${
                  futureExcludedCount > 0
                    ? ` 진단 발행일 이후 날짜의 거래 ${futureExcludedCount}건은 계산에서 제외되었습니다.`
                    : ""
                }`
              : "※ 제출된 거래 실적 문서가 없어 내부 성장 신호와 성장 잠재력 등급을 산정하지 못했습니다."}
          </p>
          {settlement && (
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">
              ※ 입금내역에서 입금 {settlement.count}건(합계 {wonText(settlement.total)}원)을
              확인했으며, 입금 확인 목적으로만 참고하고 매출·거래처 계산에는
              합산하지 않았습니다.
            </p>
          )}
        </section>

        {/* 3. 종합 진단 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-medium text-zinc-900">
            3. 종합 진단
          </h2>
          <div className="space-y-2 text-[13px] leading-7 text-zinc-900">
            {/*
              가/나/다는 축별(외부·내부·리스크) 규칙 기반 문장이라 항상 같은
              수치에서 같은 결론이 나온다. 공문서 양식에는 이 재현성이 필요하다.
              LLM 문장은 그걸 대체하는 게 아니라 "라. 종합 의견"으로 덧붙인다.
            */}
            <p className="-indent-4 pl-4">가. {diagnosis.external}</p>
            <p className="-indent-4 pl-4">나. {diagnosis.internal}</p>
            <p className="-indent-4 pl-4">다. {diagnosis.risk}</p>
            {llmDiagnosis && (
              <p className="-indent-4 pl-4">라. {llmDiagnosis}</p>
            )}
            {/* 인쇄물에는 버튼이 남으면 안 된다. */}
            {hasData && !llmDiagnosis && llmState === "loading" && (
              <p className="-indent-4 pl-4 text-zinc-400 print:hidden">
                라. AI 종합 의견을 작성하는 중입니다…
              </p>
            )}
            {hasData && !llmDiagnosis && llmState !== "loading" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={requestLlmDiagnosis}
                  className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-[12px] text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  AI 종합 의견 추가
                </button>
                <span className="text-[11px] text-zinc-500">
                  {llmState === "failed"
                    ? "의견을 받지 못했습니다. 위 가·나·다는 규칙 기반으로 작성되었습니다."
                    : "누르면 위 비율 수치가 외부 AI로 전송됩니다. 기업명·거래처명·문서는 전송되지 않지만, 비율 자체도 이 기업의 영업 정보이니 확인 후 눌러 주세요."}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 4. 분석 근거 문서 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-medium text-zinc-900">
            4. 분석 근거 문서
          </h2>
          <p className="-indent-4 pl-4 text-[13px] leading-7 text-zinc-900">
            {evidenceDocs.length === 0
              ? "제출된 문서가 없어 내부 성장 신호를 산정하지 못했습니다. 붙임 없음."
              : `붙임${evidenceDocs.map((doc, i) => `${i + 1}. ${doc}`).join("　")}　각 1부.`}
          </p>
        </section>

        {/* 끝 표시 */}
        <p className="mt-6 text-right text-[13px] font-medium text-zinc-900">
          끝.
        </p>

        {/* 발신 명의 */}
        <div className="mt-10 border-t border-zinc-300 pt-8 text-center">
          <p className="text-[20px] font-medium tracking-[0.25em] text-zinc-900">
            BO : IM AI 진단 시스템
          </p>
        </div>

        {/* 유의사항 */}
        <p className="mt-8 border-t border-zinc-200 pt-4 text-[11px] leading-5 text-zinc-500">
          ※ 본 보고서는 신용평가 결과가 아닌 AI 기반 성장 진단 참고 자료이며,
          투자·대출 등의 판단 근거로 단독 사용할 수 없습니다.
        </p>
      </div>

      {/* 화면 전용 버튼 */}
      <div className="mt-6 flex flex-col gap-2 print:hidden">
        <button
          type="button"
          onClick={() => {
            if (ready) window.print();
          }}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98]"
        >
          리포트 인쇄 / PDF 저장
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/company"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-100 bg-white text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            새 기업 진단
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-100 bg-white text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            처음으로
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
