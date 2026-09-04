import type { Visibility } from "@/lib/visibility";
import type { Signals } from "@/lib/signals";
import { generateDiagnosisText } from "@/lib/llm/providers";
import { MASKED_CUSTOMER_LABEL, restoreCustomerName } from "@/lib/llm/customer-mask";
import { remember } from "@/lib/external/cache";

// Step 02(외부 가시성) 요약. 뉴스·특허·고용·공시는 원래 공개 정보라 마스킹이 필요 없다.
// 확인하지 못한 축은 0건이라고 적지 않는다. 숫자로 넘기면 LLM이 "특허가 없어"
// 같은 문장을 만들어 버리고, 그 문장이 화면과 진단서에 그대로 실린다.
function describeCounts(visibility: Visibility): string {
  const unavailable = new Set(visibility.unavailable);
  const value = (
    key: "news" | "patent" | "employment" | "disclosure",
    label: string,
    count: number,
    unit: string,
    isAtLeast?: boolean,
  ) =>
    unavailable.has(key)
      ? `${label} 확인 불가(외부 서비스 응답 없음, 값을 추측하지 마세요)`
      : `${label} ${count.toLocaleString()}${unit}${isAtLeast ? " 이상" : ""}`;

  return [
    value("news", "뉴스", visibility.newsCount, "건", visibility.newsCountIsAtLeast),
    value(
      "patent",
      "특허",
      visibility.patentCount,
      "건",
      visibility.patentCountIsAtLeast,
    ),
    value("employment", "국민연금 가입자", visibility.employeeCount, "명"),
    value("disclosure", "최근 1년 공시", visibility.disclosureCount, "건"),
  ].join(" / ");
}

export async function generateVisibilityInsight(
  visibility: Visibility,
): Promise<string> {
  const prompt = `다음은 한 기업의 외부 가시성(공개 정보) 지표입니다. 이 수치만 근거로 2문장 이내로 해석 문장을 작성하세요. 숫자를 새로 만들지 마세요.

가시성 점수: ${visibility.visibilityScore}점 (${visibility.interpretations.visibility})
${describeCounts(visibility)}`;

  // 같은 수치에는 같은 문장이면 된다. 단계를 오가며 Step 02 로 돌아올 때마다
  // 10초씩 다시 쓰게 두지 않는다. 프롬프트 자체를 키로 삼으므로 수치가 바뀌면
  // 새로 쓴다(lib/external/cache.ts).
  return remember(`visibility-insight:${prompt}`, () =>
    generateDiagnosisText(prompt),
  );
}

// Step 05(내부 성장 신호) 요약. 거래처명은 마스킹 후 프롬프트에 넣고, 응답을 되돌린다.
export async function generateSignalsInsight(
  signals: Signals,
): Promise<string> {
  const prompt = `다음은 한 기업의 내부 거래 기반 성장 신호입니다. 이 수치만 근거로 2문장 이내로 해석 문장을 작성하세요. 숫자를 새로 만들지 마세요.

거래처 증가율: ${signals.customerGrowthRate}% (${signals.previousCustomersCount}곳 → ${signals.recentCustomersCount}곳)
반복거래율: ${signals.repeatPurchaseRate}%
최대 거래처 집중도: ${signals.topCustomerConcentration}% (${MASKED_CUSTOMER_LABEL})`;

  const rawText = await generateDiagnosisText(prompt);

  return restoreCustomerName(rawText, signals.topCustomerName);
}
