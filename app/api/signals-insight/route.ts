import { NextResponse, type NextRequest } from "next/server";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL } from "@/lib/llm/customer-mask";

// 내부 성장 신호 해석 문장.
//
// 판단은 코드가 이미 끝냈다. 어떤 지표를 볼지, 어떻게 셀지, 무엇을 긍정/보통/주의로
// 볼지는 lib/signals.ts 가 정한다. 여기 오는 건 그 결과뿐이고, LLM은 문장으로
// 옮기는 일만 맡는다. 그래서 같은 데이터에는 항상 같은 판정이 나온다.
//
// 이 화면의 수치는 사용자가 올린 문서에서 나온다. 그래서 기본값은 "호출하지 않음"
// 이고, 사용자가 버튼을 눌렀을 때만 여기로 온다. 거래처명은 오지 않는다.
const MAX_PERCENT = 100000;
const MAX_NOTE = 40;

const ALLOWED_LABELS = [
  "거래처 증가율",
  "거래금액 증가율",
  "반복거래율",
  "최대 거래처 집중도",
  "거래 지속성",
  "최근 추세",
];

function toNumber(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-MAX_PERCENT, Math.min(MAX_PERCENT, value));
}

// 화면이 이미 계산해 둔 값만 받는다. 목록 밖의 문자열은 버린다.
// 클라이언트가 보낸 문자열을 그대로 프롬프트에 넣으면 인젝션 통로가 된다.
function toAllowed(raw: unknown, allowed: string[]): string {
  return typeof raw === "string" && allowed.includes(raw) ? raw : "";
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
  const positiveCount = toNumber(body.positiveCount);
  const cautionCount = toNumber(body.cautionCount);
  const activityLevel = toAllowed(body.activityLevel, ["활발", "보통", "저조"]);

  const rows = (Array.isArray(body.signals) ? body.signals : [])
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        label: toAllowed(item.label, ALLOWED_LABELS),
        value: toNumber(item.value),
        tone: toAllowed(item.tone, ["긍정", "보통", "주의"]),
        note: typeof item.note === "string" ? item.note.slice(0, MAX_NOTE) : "",
      };
    })
    .filter((item) => item.label !== "");

  const table = rows
    .map((item) => `- ${item.label}: ${item.value}% — ${item.tone} (${item.note})`)
    .join("\n");

  const prompt = `당신은 중소기업의 내부 거래 데이터를 읽는 애널리스트입니다.
아래 지표와 판정은 이미 정해진 계산식으로 산출된 것입니다. 새로 판단하거나 숫자를
만들지 말고, 주어진 판정을 그대로 전제로 설명만 작성하세요.

분석에 사용한 내부 거래: ${transactionCount}건
종합: 긍정 ${positiveCount}개 / 주의 ${cautionCount}개 → 내부 거래 활동 ${activityLevel}

${table}

[작성 지침]
- 2문장. 두 문장은 서로 다른 이야기를 해야 합니다.
- 1문장: 주의 판정을 받은 지표가 있으면 그것을, 없으면 가장 뚜렷한 긍정 지표를 골라
  그 수치가 이 기업에 무엇을 뜻하는지 쓰세요.
- 2문장: 그 지표 때문에 무엇을 확인하거나 관리해야 하는지 쓰세요.
- 지표를 나열하지 말고 해석하세요.
- 판정을 뒤집지 마세요. "주의"를 좋게, "긍정"을 나쁘게 쓰지 않습니다.
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
