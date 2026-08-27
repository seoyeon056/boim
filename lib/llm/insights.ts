import type { Visibility } from "@/lib/visibility";
import type { Signals } from "@/lib/signals";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL, restoreCustomerName } from "@/lib/llm/customer-mask";

// Step 02(외부 가시성) 요약. 뉴스·특허·채용·공시 건수는 원래 공개 정보라 마스킹이 필요 없다.
export async function generateVisibilityInsight(
  visibility: Visibility,
): Promise<string> {
  const prompt = `다음은 한 기업의 외부 가시성(공개 정보) 지표입니다. 이 수치만 근거로 2문장 이내로 해석 문장을 작성하세요. 숫자를 새로 만들지 마세요.

가시성 점수: ${visibility.visibilityScore}점 (${visibility.interpretations.visibility})
뉴스 ${visibility.newsCount}${visibility.newsCountIsAtLeast ? "건 이상" : "건"} / 특허 ${visibility.patentCount}${visibility.patentCountIsAtLeast ? "건 이상" : "건"} / 채용공고 ${visibility.jobCount}건 / 최근 1년 공시 ${visibility.disclosureCount}건`;

  return generateDiagnosisText(prompt);
}

// Step 05(내부 성장 신호) 요약. 거래처명은 마스킹 후 프롬프트에 넣고, 응답을 되돌린다.
export async function generateSignalsInsight(
  signals: Signals,
): Promise<string> {
  const prompt = `다음은 한 기업의 내부 거래 기반 성장 신호입니다. 이 수치만 근거로 2문장 이내로 해석 문장을 작성하세요. 숫자를 새로 만들지 마세요.

거래처 증가율: ${signals.customerGrowthRate}% (${signals.previousCustomersCount}곳 → ${signals.customerCount}곳)
재구매율: ${signals.repeatPurchaseRate}%
최대 거래처 집중도: ${signals.topCustomerConcentration}% (${MASKED_CUSTOMER_LABEL})`;

  const rawText = await generateDiagnosisText(prompt);

  return restoreCustomerName(rawText, signals.topCustomerName);
}
