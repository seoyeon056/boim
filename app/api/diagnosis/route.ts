import { NextResponse, type NextRequest } from "next/server";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL } from "@/lib/llm/customer-mask";

// 성장 리포트의 종합 의견.
//
// 예전에는 GET으로 받아 서버가 getSignals()로 직접 계산했다. 그건 합성 데이터를
// 읽는 함수라, 리포트 표에는 사용자가 올린 문서에서 나온 수치가 찍히는데 종합
// 의견만 예시 데이터를 설명하는 상태였다. 같은 리포트 안에서 집중도가 72.7%와
// 45%로 갈렸다.
//
// 이제 화면이 실제로 표시 중인 수치를 그대로 실어 보낸다. 기업명과 거래처명은
// 담기지 않는다. 비율만으로는 익명 통계지만 실명과 묶이면 그 회사의 재무
// 프로필이 되기 때문이다. 마스킹 라벨의 실명 복원은 클라이언트가 한다.

const MAX_TEXT = 60;

function num(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

// 화면에 이미 떠 있는 짧은 해석 문구(예: "외부 정보 부족")만 받는다.
function label(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, MAX_TEXT) : "";
}

const EXTERNAL_SOURCES = ["news", "patent", "employment", "disclosure"] as const;

// 확인하지 못한 축은 0건이라고 적지 않는다. 숫자로 넘기면 LLM이 "특허가 없어"
// 같은 문장을 만들고, 그 문장이 진단서에 그대로 실린다.
function describeExternalCounts(body: Record<string, unknown>): string {
  const missing = new Set(
    (Array.isArray(body.unavailable) ? body.unavailable : []).filter(
      (item): item is string =>
        typeof item === "string" &&
        (EXTERNAL_SOURCES as readonly string[]).includes(item),
    ),
  );

  const value = (
    key: (typeof EXTERNAL_SOURCES)[number],
    text: string,
    count: unknown,
    unit: string,
    isAtLeast?: unknown,
  ) =>
    missing.has(key)
      ? `${text} 확인 불가(외부 서비스 응답 없음, 값을 추측하지 마세요)`
      : `${text} ${num(count).toLocaleString()}${unit}${isAtLeast === true ? " 이상" : ""}`;

  return [
    value("news", "뉴스", body.newsCount, "건", body.newsCountIsAtLeast),
    value("patent", "특허", body.patentCount, "건", body.patentCountIsAtLeast),
    value("employment", "국민연금 가입자", body.employeeCount, "명"),
    value("disclosure", "최근 1년 공시", body.disclosureCount, "건"),
  ].join(" · ");
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

  const period = label(body.period);
  const transactionCount = num(body.transactionCount);

  // 예전 프롬프트는 숫자만 나열하고 "2~3문장으로 해석하라"고만 했다. 근거가 빈약해
  // 수치를 그대로 읊는 문장밖에 나오지 않았다. 무엇을 판단해야 하는지, 각 수치가
  // 어떤 판정을 받았는지, 어떤 순서로 쓸지까지 준다.
  const prompt = `당신은 중소기업 성장 진단 리포트를 쓰는 애널리스트입니다.
아래 지표만 근거로 종합 의견을 작성하세요. 숫자를 새로 만들거나 추정하지 마세요.

[대상]
분석 기간: ${period || "미상"}
분석에 사용한 내부 거래: ${transactionCount}건

[외부에서 확인되는 정보]
가시성 점수: ${num(body.visibilityScore)}점 / 100점 (${label(body.visibilityInterpretation)})
${describeExternalCounts(body)}

[내부 거래에서 확인되는 신호]
거래처 증가율: ${num(body.customerGrowthRate)}% (${num(body.previousCustomersCount)}곳 → ${num(body.recentCustomersCount)}곳) — ${label(body.growthStatus)}
반복거래율: ${num(body.repeatPurchaseRate)}% — ${label(body.repeatStatus)}
최대 거래처 집중도: ${num(body.topCustomerConcentration)}% (${MASKED_CUSTOMER_LABEL}) — ${label(body.concentrationStatus)}

[작성 지침]
- 3~4문장. 각 문장은 서로 다른 이야기를 해야 합니다.
- 1문장: 외부에서 보이는 모습과 내부 거래에서 보이는 모습을 대조해 이 기업의 상태를 규정하세요.
- 2문장: 가장 뚜렷한 강점을 근거 수치와 함께 쓰세요. 강점이 없으면 없다고 쓰세요.
- 3문장: 가장 큰 위험 요인을 근거 수치와 함께 쓰세요.
- 4문장: 다음에 확인하거나 보완해야 할 것을 한 가지만 제시하세요.
- 수치를 단순히 나열하지 말고, 그 수치가 무엇을 뜻하는지 해석하세요.
- 신용평가처럼 단정하지 말고 참고 자료의 어조를 유지하세요.
- 거래처 이름은 "${MASKED_CUSTOMER_LABEL}"로만 지칭하세요.`;

  try {
    const text = await generateDiagnosisText(prompt);
    return NextResponse.json({ diagnosis: text.trim() });
  } catch {
    return NextResponse.json(
      { message: "종합 의견을 만들지 못했습니다." },
      { status: 502 },
    );
  }
}
