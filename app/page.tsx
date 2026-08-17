"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// 랜딩의 카드 애니메이션에만 쓰는 예시 수치. 실제 진단 결과는 API에서 가져온다.
const COMPANIES = [
  {
    name: "한빛정밀",
    external: [
      { label: "뉴스 노출", value: "0건", warn: true, pct: 4 },
      { label: "특허 등록", value: "2건", warn: false, pct: 22 },
      { label: "채용 공고", value: "0건", warn: true, pct: 4 },
    ],
    internal: [
      { label: "거래처 증가율", value: "+150%", positive: true, pct: 88 },
      { label: "재구매율", value: "80%", positive: true, pct: 80 },
      { label: "거래처 집중도", value: "45%", positive: false, pct: 45 },
    ],
  },
  {
    name: "동화테크",
    external: [
      { label: "뉴스 노출", value: "1건", warn: true, pct: 6 },
      { label: "특허 등록", value: "0건", warn: true, pct: 4 },
      { label: "채용 공고", value: "0건", warn: true, pct: 4 },
    ],
    internal: [
      { label: "거래처 증가율", value: "+210%", positive: true, pct: 95 },
      { label: "재구매율", value: "92%", positive: true, pct: 92 },
      { label: "거래처 집중도", value: "38%", positive: false, pct: 38 },
    ],
  },
  {
    name: "성신공업",
    external: [
      { label: "뉴스 노출", value: "0건", warn: true, pct: 4 },
      { label: "특허 등록", value: "5건", warn: false, pct: 35 },
      { label: "채용 공고", value: "1건", warn: false, pct: 10 },
    ],
    internal: [
      { label: "거래처 증가율", value: "+90%", positive: true, pct: 72 },
      { label: "재구매율", value: "74%", positive: true, pct: 74 },
      { label: "거래처 집중도", value: "52%", positive: false, pct: 52 },
    ],
  },
  {
    name: "대원기계",
    external: [
      { label: "뉴스 노출", value: "0건", warn: true, pct: 4 },
      { label: "특허 등록", value: "1건", warn: false, pct: 12 },
      { label: "채용 공고", value: "0건", warn: true, pct: 4 },
    ],
    internal: [
      { label: "거래처 증가율", value: "+320%", positive: true, pct: 98 },
      { label: "재구매율", value: "88%", positive: true, pct: 88 },
      { label: "거래처 집중도", value: "29%", positive: true, pct: 29 },
    ],
  },
];

const highlights = [
  {
    title: "뉴스·특허·채용 정보가 적은 B2B 제조기업",
    body: "외부에 잘 드러나지 않는 기업일수록 BO:IM의 진단이 필요합니다.",
  },
  {
    title: "거래는 느는데 평가엔 반영되지 않는 기업",
    body: "신용평가는 여전히 공개 정보 중심이라 실제 성장이 가려집니다.",
  },
];

const TOTAL_CARDS = 10;
const ANGLES = Array.from(
  { length: TOTAL_CARDS },
  (_, i) => -36 + (i / (TOTAL_CARDS - 1)) * 72,
);
const Y_OFFSETS = ANGLES.map((a) => Math.abs(a) * 0.4);

type Phase = "stacked" | "fanned" | "drawn";

function DiagnosticVisual() {
  const [phase, setPhase] = useState<Phase>("stacked");
  const [drawnCard, setDrawnCard] = useState(5);
  const [companyIdx, setCompanyIdx] = useState(0);
  const dead = useRef(false);

  useEffect(() => {
    dead.current = false;
    const T: ReturnType<typeof setTimeout>[] = [];

    function after(ms: number, fn: () => void) {
      T.push(
        setTimeout(() => {
          if (!dead.current) fn();
        }, ms),
      );
    }

    function runLoop(start: number) {
      // 1. 쌓인 상태로 잠깐 멈춘다
      after(start, () => setPhase("stacked"));

      // 2. 부채꼴로 펼친다
      after(start + 150, () => setPhase("fanned"));

      const pool = Array.from({ length: TOTAL_CARDS }, (_, i) => i);
      const picks: number[] = [];
      while (picks.length < 4) {
        const r = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(r, 1)[0]);
      }

      let t = start + 150 + 500; // 펼침이 끝난 뒤부터

      // 3. 기업 4곳을 차례로 뽑아 보여준다
      for (let d = 0; d < 4; d++) {
        const card = picks[d];
        const company = d;
        const drawAt = t;

        after(drawAt, () => {
          setDrawnCard(card);
          setCompanyIdx(company);
          setPhase("drawn");
        });

        after(drawAt + 2800, () => setPhase("fanned")); // 카드를 되돌린다
        t = drawAt + 2800 + 600 + 200;
      }

      // 4. 다시 쌓는다
      after(t, () => setPhase("stacked"));

      // 5. 곧바로 반복
      after(t + 100, () => runLoop(t + 100));
    }

    runLoop(0);
    return () => {
      dead.current = true;
      T.forEach(clearTimeout);
    };
  }, []);

  const company = COMPANIES[companyIdx];

  function cardTransform(i: number): string {
    if (phase === "stacked") {
      return `rotate(0deg) translateY(${(TOTAL_CARDS - i - 1) * -0.6}px)`;
    }
    if (phase === "drawn" && i === drawnCard) {
      return `rotate(0deg) scale(1.85) translateY(-130px)`;
    }
    return `rotate(${ANGLES[i]}deg) translateY(${Y_OFFSETS[i]}px)`;
  }

  function cardTransition(i: number): string {
    const isDrawn = phase === "drawn" && i === drawnCard;
    if (isDrawn)
      return "transform 0.75s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease, opacity 0.4s ease";
    if (phase === "fanned")
      return "transform 0.5s cubic-bezier(0.25,1,0.5,1), box-shadow 0.4s ease, opacity 0.4s ease";
    return "transform 0.7s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s ease, opacity 0.4s ease";
  }

  const isDrawnPhase = phase === "drawn";

  return (
    <div className="flex items-center justify-center py-4 md:py-0">
      <div className="relative" style={{ width: 360, height: 460 }}>
        {Array.from({ length: TOTAL_CARDS }).map((_, i) => {
          const isDrawn = isDrawnPhase && i === drawnCard;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                bottom: 16,
                left: "50%",
                width: 112,
                height: 165,
                marginLeft: -56,
                transformOrigin: "bottom center",
                transform: cardTransform(i),
                zIndex: isDrawn ? 20 : i,
                transition: cardTransition(i),
                opacity: isDrawnPhase && !isDrawn ? 0.92 : 1,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: isDrawn
                  ? "0 24px 64px rgba(0,0,0,0.28)"
                  : "0 4px 14px rgba(0,0,0,0.18)",
              }}
            >
              {/* 카드 뒷면 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(145deg,#18181b,#27272a)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  opacity: isDrawn ? 0 : 1,
                  transition: "opacity 0.25s ease",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "#52525b",
                    fontSize: 13,
                  }}
                >
                  BO
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "#3f3f46",
                    fontSize: 7,
                    letterSpacing: "0.15em",
                  }}
                >
                  :IM
                </span>
              </div>

              {/* 카드 앞면 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#ffffff",
                  opacity: isDrawn ? 1 : 0,
                  transition: "opacity 0.3s ease 0.2s",
                  padding: "6px 6px 5px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {/* 외부 지표 */}
                <div
                  style={{
                    background: "#18181b",
                    borderRadius: 7,
                    padding: "4px 6px 4px",
                    flex: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 6.5,
                        color: "#52525b",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      외부
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 6.5,
                        color: "#71717a",
                      }}
                    >
                      {company.name}
                    </span>
                  </div>
                  {company.external.map((row) => (
                    <div key={row.label} style={{ marginBottom: 2.5 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 1,
                        }}
                      >
                        <span style={{ fontSize: 6, color: "#52525b" }}>
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 6,
                            color: row.warn ? "#f59e0b" : "#71717a",
                          }}
                        >
                          {row.value}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 1.5,
                          background: "#27272a",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: isDrawn ? `${row.pct}%` : "0%",
                            background: row.warn ? "#f59e0b" : "#52525b",
                            borderRadius: 999,
                            transition: "width 0.7s ease 0.5s",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 연결 표시 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 5.5,
                      color: "#d4d4d8",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    BO:IM
                  </span>
                </div>

                {/* 내부 지표 */}
                <div
                  style={{
                    background: "#022c22",
                    borderRadius: 7,
                    padding: "4px 6px 4px",
                    flex: 1,
                  }}
                >
                  <div style={{ marginBottom: 3 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 6.5,
                        color: "#166534",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      내부
                    </span>
                  </div>
                  {company.internal.map((row) => (
                    <div key={row.label} style={{ marginBottom: 2.5 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 1,
                        }}
                      >
                        <span style={{ fontSize: 6, color: "#166534" }}>
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 6,
                            color: row.positive ? "#34d399" : "#f59e0b",
                          }}
                        >
                          {row.value}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 1.5,
                          background: "#14532d",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: isDrawn ? `${row.pct}%` : "0%",
                            background: row.positive ? "#34d399" : "#f59e0b",
                            borderRadius: 999,
                            transition: "width 0.75s ease 0.6s",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-6">
            <span
              className="animate-fade-in-up text-xs font-semibold tracking-tight text-zinc-400"
              style={{ animationDelay: "0ms" }}
            >
              기업 성장 진단 서비스
            </span>
            <h1
              className="animate-fade-in-up text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-900 md:text-5xl"
              style={{ animationDelay: "60ms" }}
            >
              안 보이던 기업을
              <br />
              <span className="font-serif italic font-normal text-zinc-400">
                데이터로 증명합니다.
              </span>
            </h1>
            <p
              className="animate-fade-in-up text-[15px] leading-[1.75] text-zinc-500"
              style={{ animationDelay: "120ms" }}
            >
              공개 정보만 보는 기존 평가와 달리, 내부 거래 문서까지 함께 분석해
              보이지 않던 성장을 증명합니다.
            </p>
            <div
              className="animate-fade-in-up pt-1"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href="/company"
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98]"
              >
                기업 진단 시작하기
              </Link>
            </div>
          </div>

          <DiagnosticVisual />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6">
        <div className="h-px bg-zinc-100" />
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold tracking-tight text-zinc-500">
            이런 기업에게 필요합니다
          </span>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 sm:grid-cols-2">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2 bg-white px-5 py-5 transition-shadow hover:shadow-sm"
              >
                <p className="text-[13px] font-semibold leading-[1.5] text-zinc-900">
                  {item.title}
                </p>
                <p className="text-[13px] leading-[1.65] text-zinc-500">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
