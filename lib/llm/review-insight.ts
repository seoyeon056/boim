import { generateDiagnosisText } from "@/lib/llm/providers";

// Step 04(AI 분석 결과 확인) 요약.
//
// 이 화면의 원본 데이터는 사용자가 올린 거래명세서에서 뽑은 값이라 거래처명·품목·
// 금액이 전부 들어 있다. 그래서 프롬프트에는 값을 하나도 넣지 않고 "몇 개 항목이
// 신뢰도 몇 구간에 있는지"라는 통계만 넣는다. LLM은 어떤 회사와 거래했는지,
// 얼마짜리 거래인지 전혀 보지 못한다.
//
// Step 05는 거래처명을 마스킹 라벨로 바꿔 넣고 응답에서 되돌리는데(customer-mask.ts),
// 여기서는 애초에 문장에 거래처명이 나올 이유가 없어 마스킹조차 필요 없다.

export type ReviewFieldStat = {
  label: string;
  needReview: number;
};

export type ReviewStats = {
  transactionCount: number;
  totalFields: number;
  needReview: number;
  lowConfidenceCount: number;
  byField: ReviewFieldStat[];
};

// LLM 호출이 실패해도 화면은 문장 없이 비어 있으면 안 된다.
export function buildReviewFallback(stats: ReviewStats): string {
  if (stats.needReview === 0) {
    return `${stats.totalFields}개 항목이 모두 자동으로 확인되었습니다. 그대로 진행하셔도 됩니다.`;
  }

  const worst = [...stats.byField]
    .filter((field) => field.needReview > 0)
    .sort((a, b) => b.needReview - a.needReview)[0];

  const focus = worst ? ` ${worst.label} 항목을 먼저 보시면 됩니다.` : "";

  return `총 ${stats.totalFields}개 항목 중 ${stats.needReview}개가 확인이 필요합니다.${focus}`;
}

export async function generateReviewInsight(
  stats: ReviewStats,
): Promise<string> {
  const fieldLines = stats.byField
    .map((field) => `- ${field.label}: 확인 필요 ${field.needReview}개`)
    .join("\n");

  const prompt = `다음은 문서에서 자동 추출한 항목의 신뢰도 집계입니다. 사용자가 무엇을 먼저 확인하면 되는지 2문장 이내로 안내하세요. 숫자를 새로 만들지 말고, 아래에 없는 내용을 추측하지 마세요.

거래 건수: ${stats.transactionCount}건
전체 항목: ${stats.totalFields}개
확인 필요: ${stats.needReview}개 (이 중 신뢰도가 특히 낮은 항목 ${stats.lowConfidenceCount}개)

항목별 확인 필요 개수:
${fieldLines}`;

  return generateDiagnosisText(prompt);
}
