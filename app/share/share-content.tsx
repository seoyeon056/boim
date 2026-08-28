"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";

import {
  fetchDiagnosis,
  fetchSignals,
  fetchVisibility,
  type SignalsResult,
  type VisibilityResult,
} from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";
import { readUploadedSignals } from "@/lib/uploaded-signals";
import { restoreCustomerName } from "@/lib/llm/customer-mask";
import { grantAiConsent, hasAiConsent } from "@/lib/ai-consent";

// LLM에 넘길 판정 표기. 화면의 "긍정/주의"와 같은 말을 쓴다.
const STATUS_TEXT = { positive: "긍정", neutral: "보통", caution: "주의" } as const;

// 공문서 양식의 최종 진단서.
// 기업명·점수·성장 신호는 모두 진단 중인 기업에 맞춰 API에서 읽어온다.

const PERIOD = "2026년 01월 – 2026년 06월";

const EVIDENCE_DOCS = [
  "거래명세서",
  "세금계산서",
  "발주서",
  "견적서",
  "계약서",
  "입금내역",
];

// 진단서 본문 서체. 나눔명조는 획이 굵고 예스러워 문서가 무거워 보인다.
// Noto Serif KR 은 획이 가늘고 자간이 정돈돼 있어 같은 문서 톤을 유지하면서 덜 튄다.
const serif = {
  fontFamily: "var(--font-document)",
  fontWeight: 400,
  letterSpacing: "0.01em",
} as const;

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
  const [signals, setSignals] = useState<SignalsResult | null>(null);
  // 업로드·검수한 거래로 계산한 신호. 있으면 서버의 합성 데이터 대신 이걸 쓴다.
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);
  // LLM이 쓴 종합 진단. 도착 전이거나 실패하면 규칙 기반 문장(가/나/다)을 쓴다.
  const [llmDiagnosis, setLlmDiagnosis] = useState<string | null>(null);
  const [llmState, setLlmState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    let isActive = true;

    // 사용자가 올린 문서에서 계산한 신호가 있으면 그걸 우선한다.
    // 서버는 sessionStorage를 볼 수 없어서 이 판단은 브라우저에서만 가능하다.
    const uploaded = readUploadedSignals(companyId ?? "");

    Promise.all([fetchVisibility(companyId), fetchSignals(companyId)])
      .then(([visibilityResult, signalsResult]) => {
        if (!isActive) return;

        const effective = uploaded ? uploaded.signals : signalsResult;
        setVisibility(visibilityResult);
        setSignals(effective);
        setUploadedCount(uploaded ? uploaded.transactionCount : null);

        // Step 05에서 이미 동의했으면 여기서 또 묻지 않는다. 같은 종류의 값을
        // 보내는 같은 질문이라, 흐름 안에서 두 번 물으면 성가시기만 하다.
        if (!hasAiConsent()) {
          return;
        }

        setLlmState("loading");
        return runDiagnosis(visibilityResult, effective, uploaded?.transactionCount ?? 0)
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
        setSignals(null);
      });

    return () => {
      isActive = false;
    };
  }, [companyId]);

  // 지표와 신호를 받아 종합 의견 문장을 만든다. 자동 생성과 버튼이 같은 경로를 쓴다.
  async function runDiagnosis(
    view: VisibilityResult,
    values: SignalsResult,
    count: number,
  ): Promise<string> {
    const { diagnosis: text } = await fetchDiagnosis({
      period: PERIOD,
      transactionCount: count,
      visibilityScore: view.visibilityScore,
      visibilityInterpretation: view.interpretations.visibility,
      newsCount: view.newsCount,
      patentCount: view.patentCount,
      jobCount: view.jobCount,
      disclosureCount: view.disclosureCount,
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
  // 값이라, 외부 모델로 보낼지를 사용자가 정하게 한다. 기업명과 거래처명은 보내지
  // 않지만 비율 자체가 그 회사의 영업 정보이기 때문이다.
  async function requestLlmDiagnosis() {
    if (!visibility || !signals) return;
    grantAiConsent();
    setLlmState("loading");
    try {
      setLlmDiagnosis(
        await runDiagnosis(visibility, signals, uploadedCount ?? 0),
      );
      setLlmState("idle");
    } catch {
      setLlmState("failed");
    }
  }

  const diagnosis =
    visibility && signals ? buildDiagnosis(visibility, signals) : null;

  const companyName = visibility ? visibility.company : "불러오는 중";

  const infoRows: { label: string; value: string }[][] = [
    [
      { label: "기 업 명", value: companyName },
      { label: "분석 기간", value: PERIOD },
    ],
    [
      {
        label: "외부 가시성 점수",
        value: visibility ? `${visibility.visibilityScore}점 / 100점` : "-",
      },
      { label: "성장 잠재력 등급", value: diagnosis ? diagnosis.grade : "-" },
    ],
    [
      { label: "분석 기관", value: "BO:IM AI 진단 시스템" },
      { label: "발 행 일", value: issuedAt },
    ],
  ];

  // 판정(긍정/주의)은 lib/signals.ts 계산 결과를 그대로 쓴다.
  // 지표 정의는 lib/signals.ts 가 갖는다. 리포트는 계산 결과를 옮겨 적는다.
  const growthSignals = signals
    ? signals.signals.map((item, index) => ({
        no: String(index + 1),
        label: item.label,
        value: `${item.prefix}${item.value}${item.suffix}`,
        tone: item.tone,
        note: item.detail,
      }))
    : [];

  return (
    <div className="min-h-screen print:min-h-0" style={{ backgroundColor: "#E9E2DD" }}>
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
          <p className="mt-2 text-[12px] tracking-[0.2em] text-zinc-500">
            {PERIOD.replace("–", "~")}
          </p>
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
                    성장 신호를 불러오는 중입니다.
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
                      {signal.tone === "positive" ? "긍정" : "주의"}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2.5 text-[12px] text-zinc-600">
                      {signal.note}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/*
            이 표의 수치가 무엇에서 나왔는지 밝힌다. 예전에는 업로드 문서가 없거나
            추출이 실패해도 예시 데이터가 조용히 실제 분석 결과처럼 표시됐다.
          */}
          {signals && (
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              {uploadedCount === null
                ? "※ 제출된 거래명세서에서 거래 내역을 확인하지 못해, 위 수치는 예시 데이터로 산출되었습니다."
                : `※ 위 수치는 제출된 거래명세서에서 확인된 거래 ${uploadedCount}건을 근거로 산출되었습니다.`}
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
              그래야 LLM이 실패해도 문서 구조가 바뀌지 않는다.
            */}
            {diagnosis ? (
              <>
                <p className="-indent-4 pl-4">가. {diagnosis.external}</p>
                <p className="-indent-4 pl-4">나. {diagnosis.internal}</p>
                <p className="-indent-4 pl-4">다. {diagnosis.risk}</p>
                {llmDiagnosis && (
                  <p className="-indent-4 pl-4">라. {llmDiagnosis}</p>
                )}
                {/* 인쇄물에는 버튼이 남으면 안 된다. */}
                {!llmDiagnosis && llmState === "loading" && (
                  <p className="-indent-4 pl-4 text-zinc-400 print:hidden">
                    라. AI 종합 의견을 작성하는 중입니다…
                  </p>
                )}
                {!llmDiagnosis && llmState !== "loading" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={requestLlmDiagnosis}
                      disabled={!signals}
                      className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-[12px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:text-zinc-300"
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
              </>
            ) : (
              <p className="-indent-4 pl-4">진단 결과를 불러오는 중입니다.</p>
            )}
          </div>
        </section>

        {/* 4. 분석 근거 문서 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-medium text-zinc-900">
            4. 분석 근거 문서
          </h2>
          <p className="-indent-4 pl-4 text-[13px] leading-7 text-zinc-900">
            붙임
            {EVIDENCE_DOCS.map((doc, i) => `${i + 1}. ${doc}`).join("　")}
            　각 1부.
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
          onClick={() => window.print()}
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
