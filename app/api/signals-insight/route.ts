import { NextResponse, type NextRequest } from "next/server";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL } from "@/lib/llm/customer-mask";

// 내부 성장 신호 해석 문장.
//
// 이 화면의 수치는 사용자가 올린 문서에서 계산된다. 그래서 기본값은 "호출하지
// 않음"이고, 사용자가 버튼을 눌렀을 때만 여기로 온다.
//
// 오는 것은 비율 숫자뿐이다. 거래처명은 클라이언트가 보내지 않고, 응답에 들어간
// 마스킹 라벨을 클라이언트가 실명으로 되돌린다. 거래처명은 서버를 거치지 않는다.
const MAX_PERCENT = 100000;

function toNumber(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-MAX_PERCENT, Math.min(MAX_PERCENT, value));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: "요청 본문을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  const growthRate = toNumber(body.customerGrowthRate);
  const previousCount = toNumber(body.previousCustomersCount);
  const recentCount = toNumber(body.recentCustomersCount);
  const repeatRate = toNumber(body.repeatPurchaseRate);
  const concentration = toNumber(body.topCustomerConcentration);

  const prompt = `다음은 한 기업의 내부 거래 기반 성장 신호입니다. 이 수치만 근거로 2문장 이내로 해석 문장을 작성하세요. 숫자를 새로 만들지 마세요.

거래처 증가율: ${growthRate}% (${previousCount}곳 → ${recentCount}곳)
재구매율: ${repeatRate}%
최대 거래처 집중도: ${concentration}% (${MASKED_CUSTOMER_LABEL})`;

  try {
    const text = await generateDiagnosisText(prompt);
    return NextResponse.json({ insight: text.trim() });
  } catch {
    return NextResponse.json(
      { message: "해석 문장을 만들지 못했습니다." },
      { status: 502 },
    );
  }
}
