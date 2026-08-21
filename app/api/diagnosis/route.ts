import { NextRequest, NextResponse } from "next/server";
import { getSignals, getVisibility } from "@/lib/engine";
import { generateDiagnosisText } from "@/lib/llm/providers";

const MASKED_CUSTOMER_LABEL = "최대 거래처"; // LLM에는 이 라벨만 보인다.

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("company") ?? undefined;

  // 숫자는 서버가 직접 계산해서 넘긴다 — LLM은 해석·문장만 담당한다.
  const signals = await getSignals(companyId);
  const visibility = await getVisibility(companyId);
  const realCustomerName = signals.topCustomerName;

  const prompt = `다음은 한 기업의 성장 진단 데이터입니다. 이 수치만 근거로 2~3문장의 종합 진단을 작성하세요. 숫자를 새로 만들지 마세요.

외부 가시성 점수: ${visibility.visibilityScore}점 (${visibility.interpretations.visibility})
뉴스 ${visibility.newsCount}건 / 특허 ${visibility.patentCount}건 / 채용공고 ${visibility.jobCount}건
거래처 증가율: ${signals.customerGrowthRate}%
재구매율: ${signals.repeatPurchaseRate}%
최대 거래처 집중도: ${signals.topCustomerConcentration}% (${MASKED_CUSTOMER_LABEL})`;

  const rawText = await generateDiagnosisText(prompt);

  // LLM은 실제 거래처명을 한 번도 본 적 없다. 사용자에게 보여줄 때만
  // 마스킹 라벨을 실제 이름으로 되돌린다.
  const text = realCustomerName
    ? rawText.replaceAll(MASKED_CUSTOMER_LABEL, realCustomerName)
    : rawText;

  return NextResponse.json({ diagnosis: text });
}