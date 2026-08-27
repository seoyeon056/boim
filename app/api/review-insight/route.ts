import { NextResponse, type NextRequest } from "next/server";
import {
  buildReviewFallback,
  generateReviewInsight,
  type ReviewStats,
} from "@/lib/llm/review-insight";

// Step 04 검수 화면의 안내 문장.
//
// 다른 라우트와 달리 POST인 이유: 이 화면의 원본 데이터는 서버에 없다.
// 업로드·추출 결과는 sessionStorage에만 있어서 클라이언트가 집계를 보내야 한다.
//
// 다만 보내는 건 "개수"뿐이다. 거래처명·품목·금액 같은 실제 값은 요청 본문에
// 아예 들어오지 않고, 들어오더라도 아래 정규화를 거치면서 전부 버려진다.
//
// 다른 라우트가 붙이는 lib/cors.ts 헤더는 여기서 쓰지 않는다. 그쪽은
// Allow-Methods가 "GET, OPTIONS"라 POST를 허용하지도 않고, 이 라우트는 같은 앱의
// 화면에서만 호출하는 동일 출처 요청이라 CORS 자체가 필요 없다.

// 클라이언트가 보낸 값은 믿지 않는다. 숫자가 아니거나 음수/과대값이면 잘라낸다.
// 그대로 프롬프트에 넣으면 "확인 필요 99999999개" 같은 문장이 나온다.
const MAX_COUNT = 10_000;

function toCount(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_COUNT, Math.max(0, Math.floor(value)));
}

// 필드 라벨도 클라이언트가 보낸 문자열이라 프롬프트에 그대로 넣으면 인젝션
// 통로가 된다. 화면에서 쓰는 네 가지 외에는 받지 않는다.
const ALLOWED_LABELS = ["거래 날짜", "거래처", "품목", "거래금액"];

function toStats(raw: unknown): ReviewStats {
  const body = (raw ?? {}) as Record<string, unknown>;
  const rawFields = Array.isArray(body.byField) ? body.byField : [];

  const byField = rawFields
    .map((item) => {
      const field = (item ?? {}) as Record<string, unknown>;
      return {
        label: String(field.label ?? ""),
        needReview: toCount(field.needReview),
      };
    })
    .filter((field) => ALLOWED_LABELS.includes(field.label));

  return {
    transactionCount: toCount(body.transactionCount),
    totalFields: toCount(body.totalFields),
    needReview: toCount(body.needReview),
    lowConfidenceCount: toCount(body.lowConfidenceCount),
    byField,
  };
}

export async function POST(request: NextRequest) {
  let stats: ReviewStats;

  try {
    stats = toStats(await request.json());
  } catch {
    return NextResponse.json(
      { message: "요청 본문을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  // LLM이 실패해도 화면에는 안내 문장이 있어야 한다. 규칙 기반 문장으로 대체한다.
  const insight = await generateReviewInsight(stats).catch(() =>
    buildReviewFallback(stats),
  );

  return NextResponse.json({
    insight: insight.trim() || buildReviewFallback(stats),
  });
}
