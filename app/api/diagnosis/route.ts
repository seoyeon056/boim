import { NextRequest, NextResponse } from "next/server";
import { getSignals, getVisibility } from "@/lib/engine";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL, restoreCustomerName } from "@/lib/llm/customer-mask";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("company") ?? undefined;

  // 숫자는 서버가 직접 계산해서 넘긴다 — LLM은 해석·문장만 담당한다.
  const signals = await getSignals(companyId);
  const visibility = await getVisibility(companyId);

  const prompt = `다음은 한 기업의 성장 진단 데이터입니다. 이 수치만 근거로 2~3문장의 종합 진단을 작성하세요. 숫자를 새로 만들지 마세요.

외부 가시성 점수: ${visibility.visibilityScore}점 (${visibility.interpretations.visibility})
뉴스 ${visibility.newsCount}${visibility.newsCountIsAtLeast ? "건 이상" : "건"} / 특허 ${visibility.patentCount}${visibility.patentCountIsAtLeast ? "건 이상" : "건"} / 채용공고 ${visibility.jobCount}건 / 최근 1년 공시 ${visibility.disclosureCount}건
거래처 증가율: ${signals.customerGrowthRate}%
재구매율: ${signals.repeatPurchaseRate}%
최대 거래처 집중도: ${signals.topCustomerConcentration}% (${MASKED_CUSTOMER_LABEL})`;

  const rawText = await generateDiagnosisText(prompt);
  const text = restoreCustomerName(rawText, signals.topCustomerName);

  return NextResponse.json({ diagnosis: text });
}