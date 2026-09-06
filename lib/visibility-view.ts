import { getVisibility } from "@/lib/engine";
import { generateVisibilityInsight } from "@/lib/llm/insights";
import type { Visibility } from "@/lib/visibility";

// 외부 가시성 화면이 필요한 것을 한 번에 만들어 준다.
//
// 여기에 있는 이유는 시간을 재기 때문이다. 이 화면은 외부 조회를 기다린 뒤
// AI 문장을 다시 기다리는데, 둘을 더한 시간이 라우트 상한(maxDuration)을
// 넘으면 화면 전체가 죽는다. 고용 조회가 늦은 날에 실제로 그럴 수 있다
// (고용 상한 26초 + 사업자번호 조회 8초 + 문장 12초 = 46초 > 40초).
//
// 그래서 조회에 쓴 시간을 재서 문장 쪽에 남은 만큼만 준다. 시간이 모자라면
// 문장을 아예 부르지 않고 규칙 기반 문장으로 간다. 문장은 있으면 좋은 것이고,
// 점수와 건수는 그 시점에 이미 손에 있기 때문이다.
//
// 서버 컴포넌트 안에서는 Date.now() 를 부를 수 없다(react-hooks/purity —
// 렌더는 순수해야 한다). 그래서 이 계산이 화면이 아니라 여기에 있다.

// 응답을 실제로 내보내는 데 남겨 두는 여유.
const HEADROOM_MS = 3000;

export async function getVisibilityWithSummary(
  companyId: string | undefined,
  routeBudgetMs: number,
): Promise<{ visibility: Visibility; summary: string }> {
  const startedAt = Date.now();
  const visibility = await getVisibility(companyId);

  const left = routeBudgetMs - (Date.now() - startedAt) - HEADROOM_MS;
  if (left < 1000) {
    return { visibility, summary: visibility.summary };
  }

  // 문장 호출이 실패해도(키 미등록, 네트워크 오류, 시간 초과) 화면이 깨지지
  // 않도록 규칙 기반 문장으로 돌아간다.
  const summary = await generateVisibilityInsight(visibility, left).catch(
    () => visibility.summary,
  );

  return { visibility, summary };
}
