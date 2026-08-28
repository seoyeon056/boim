import { NextResponse, type NextRequest } from "next/server";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL } from "@/lib/llm/customer-mask";

// 내부 성장 신호 해석 문장.
//
// 이 화면의 수치는 사용자가 올린 문서에서 계산된다. 그래서 기본값은 "호출하지
// 않음"이고, 사용자가 버튼을 눌렀을 때만 여기로 온다.
//
// 오는 것은 비율 숫자와 판정뿐이다. 거래처명은 클라이언트가 보내지 않고, 응답에
// 들어간 마스킹 라벨을 클라이언트가 실명으로 되돌린다.
const MAX_PERCENT = 100000;

function toNumber(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-MAX_PERCENT, Math.min(MAX_PERCENT, value));
}

// 판정은 화면이 이미 계산한 "긍정"/"주의" 둘 중 하나다. 그 외 값은 받지 않는다.
function toStatus(raw: unknown): string {
  return raw === "긍정" || raw === "주의" ? raw : "";
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

  const transactionCount = toNumber(body.transactionCount);
  const growthRate = toNumber(body.customerGrowthRate);
  const previousCount = toNumber(body.previousCustomersCount);
  const recentCount = toNumber(body.recentCustomersCount);
  const repeatRate = toNumber(body.repeatPurchaseRate);
  const concentration = toNumber(body.topCustomerConcentration);
  const growthStatus = toStatus(body.growthStatus);
  const repeatStatus = toStatus(body.repeatStatus);
  const concentrationStatus = toStatus(body.concentrationStatus);

  // 예전 프롬프트는 비율 세 개만 던지고 "해석하라"고 했다. 무엇을 판단해야 하는지가
  // 없어서 수치를 그대로 되읊는 문장밖에 나오지 않았다. 각 수치가 어떤 판정을
  // 받았는지와, 무엇을 써야 하는지를 함께 준다.
  const prompt = `당신은 중소기업의 내부 거래 데이터를 읽는 애널리스트입니다.
아래 지표만 근거로 해석 문장을 작성하세요. 숫자를 새로 만들거나 추정하지 마세요.

분석에 사용한 내부 거래: ${transactionCount}건
거래처 증가율: ${growthRate}% (${previousCount}곳 → ${recentCount}곳) — ${growthStatus}
재구매율: ${repeatRate}% — ${repeatStatus}
최대 거래처 집중도: ${concentration}% (${MASKED_CUSTOMER_LABEL}) — ${concentrationStatus}

[작성 지침]
- 2문장. 두 문장은 서로 다른 이야기를 해야 합니다.
- 1문장: 세 지표 중 가장 주목할 것 하나를 골라, 그 수치가 이 기업에 무엇을 뜻하는지 쓰세요.
- 2문장: 그 수치 때문에 무엇을 확인하거나 관리해야 하는지 쓰세요.
- 수치를 나열하지 말고 해석하세요.
- 거래처 이름은 "${MASKED_CUSTOMER_LABEL}"로만 지칭하세요.`;

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
