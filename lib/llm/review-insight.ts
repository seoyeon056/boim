// Step 04(AI 분석 결과 확인) 안내 문장.
//
// 예전에는 이 문장을 LLM에 맡겼다. 화면에 들어가는 순간 항목 개수가 서버로 갔는데,
// 버튼도 없이 자동이라 사용자가 선택할 기회조차 없었다. 기업명은 외부 가시성
// 조회 때 이미 서버에 있으므로, 같은 세션에서 둘을 붙이면 "이 기업이 문서 몇 건을
// 올렸다"가 재구성된다.
//
// 내용을 보면 LLM이 얹을 것도 없었다 — 개수를 세고 무엇부터 보라고 말하면 끝이다.
// 규칙으로 바꾸면서 전송이 사라졌다.

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

export function buildReviewGuidance(stats: ReviewStats): string {
  if (stats.totalFields === 0) {
    return "확인할 항목이 없습니다.";
  }

  if (stats.needReview === 0) {
    return `${stats.transactionCount}건의 거래에서 읽어낸 ${stats.totalFields}개 항목이 모두 자동으로 확인되었습니다. 그대로 진행하셔도 됩니다.`;
  }

  // 확인이 필요한 항목이 어느 필드에 몰려 있는지 알려주면 훑는 순서가 잡힌다.
  const ranked = stats.byField
    .filter((field) => field.needReview > 0)
    .sort((a, b) => b.needReview - a.needReview);

  const head = `${stats.totalFields}개 항목 중 ${stats.needReview}개를 확인해 주세요.`;

  // 신뢰도가 특히 낮은 항목은 값 자체가 틀렸을 수 있어 먼저 봐야 한다.
  if (stats.lowConfidenceCount > 0) {
    const worst = ranked[0];
    const focus = worst ? ` ${worst.label} 항목이 ${worst.needReview}개로 가장 많습니다.` : "";
    return `${head} 이 중 ${stats.lowConfidenceCount}개는 문서에서 흐릿하게 읽혀 값이 다를 수 있으니 원본과 먼저 대조해 주세요.${focus}`;
  }

  if (ranked.length === 1) {
    return `${head} 모두 ${ranked[0].label} 항목이라 한 번에 훑어보실 수 있습니다.`;
  }

  const names = ranked.map((field) => `${field.label} ${field.needReview}개`).join(", ");
  return `${head} ${names} 순으로 보시면 됩니다.`;
}
