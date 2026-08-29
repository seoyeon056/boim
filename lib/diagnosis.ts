import { josa } from "@/lib/korean";
import {
  CONCENTRATION_WATCH,
  CONTINUITY_GOOD,
  REPEAT_GOOD,
  type Signals,
} from "@/lib/signals";
import type { Visibility } from "@/lib/visibility";

// BO:IM 종합 진단 문장.
// 지표는 기업마다 다른데 결론 문장이 고정이면 화면 안에서 앞뒤가 안 맞는다.
// (예: 가시성 62점인데 "외부 정보는 부족하지만"이라고 말하는 상황)
// 그래서 문장도 계산된 값에서 고른다.

export type Diagnosis = {
  grade: string; // 성장 잠재력 등급 (A/B+/B/C, 표본이 모자라면 "데이터 부족")
  headline: string; // 결론 한 문장
  external: string; // 외부에서 본 모습
  internal: string; // 내부에서 본 모습
  risk: string; // 거래처 집중도 관련
  internalCardNote: string; // 비교 화면 내부(초록) 카드 하단 요약
};

// ── 외부에서 본 모습 ─────────────────────────────────────────
// 점수 구간만 보고 문장을 고르면 어떤 기업이든 같은 말이 나온다. 어느 축에 흔적이
// 남았고 어느 축이 비었는지를 실제 건수로 짚어야 기업마다 다른 문장이 된다.
type Axis = { label: string; count: number; unit: string };

// 확인하지 못한 축은 found/missing 어느 쪽도 아니다. "없다"고 쓰면 거짓이 되고,
// 건수를 쓰면 0을 사실인 양 말하게 된다. 그래서 세 번째 갈래로 둔다.
function presentAxes(visibility: Visibility): {
  found: Axis[];
  missing: Axis[];
  unknown: Axis[];
} {
  const unavailable = new Set(visibility.unavailable);
  const axes = [
    { key: "news", label: "뉴스", count: visibility.newsCount, unit: "건" },
    { key: "patent", label: "특허", count: visibility.patentCount, unit: "건" },
    { key: "job", label: "채용 공고", count: visibility.jobCount, unit: "건" },
    {
      key: "disclosure",
      label: "공시",
      count: visibility.disclosureCount,
      unit: "건",
    },
  ] as const;

  const known = axes.filter((axis) => !unavailable.has(axis.key));

  return {
    found: known.filter((axis) => axis.count > 0),
    missing: known.filter((axis) => axis.count === 0),
    unknown: axes.filter((axis) => unavailable.has(axis.key)),
  };
}

function listAxes(axes: Axis[], withCount: boolean): string {
  return axes
    .map((axis) => (withCount ? `${axis.label} ${axis.count.toLocaleString()}${axis.unit}` : axis.label))
    .join("·");
}

function describeExternal(visibility: Visibility): string {
  const { found, missing, unknown } = presentAxes(visibility);

  // 못 부른 축이 있으면 문장 끝에 그대로 밝힌다. 침묵하면 읽는 사람은 남은
  // 축만 보고 "이 회사는 그게 없구나"로 읽는다.
  const unknownTail =
    unknown.length === 0
      ? ""
      : ` ${josa(listAxes(unknown, false), "은/는")} 외부 서비스가 응답하지 않아 이번 진단에서 확인하지 못했습니다.`;

  if (found.length === 0 && missing.length === 0) {
    return `외부 공개 정보를 이번 진단에서는 확인하지 못했습니다.${unknownTail}`;
  }

  if (found.length === 0) {
    return `외부에서는 ${josa(listAxes(missing, false), "은/는")} 어디에서도 이 기업의 활동이 확인되지 않습니다.${unknownTail}`;
  }

  if (missing.length === 0) {
    return `외부에서는 ${josa(listAxes(found, true), "이/가")} 모두 확인되어, 공개 정보만으로도 활동을 어느 정도 따라갈 수 있습니다.${unknownTail}`;
  }

  const tail =
    visibility.visibilityScore < 30
      ? "다만 그 양이 적어 최근 성장 활동을 판단하기에는 부족합니다."
      : visibility.visibilityScore < 60
        ? "다만 이것만으로 최근 성장 활동을 판단하기에는 부족합니다."
        : "다만 공개 정보는 활동의 결과가 드러난 뒤에야 쌓입니다.";

  return `외부에서는 ${josa(listAxes(found, true), "이/가")} 확인되지만 ${josa(listAxes(missing, false), "은/는")} 남아 있지 않습니다. ${tail}${unknownTail}`;
}

// ── 내부에서 본 모습 ─────────────────────────────────────────
// 거래처 확보(증가율)와 관계 유지(재구매율)는 다른 이야기다. 네 조합을 각각 쓴다.
function describeInternal(signals: Signals): string {
  if (!signals.dataSufficient) {
    return `제출한 내부 거래가 ${signals.transactionCount}건뿐이라 성장 신호를 판단하지 않았습니다. 거래 내역이 더 쌓인 뒤에 다시 보시는 편이 정확합니다.`;
  }

  const growing = signals.statuses.customerGrowthRate === "positive";
  const repeating = signals.statuses.repeatPurchaseRate === "positive";
  const flow = `${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로`;
  const repeat = `${signals.repeatPurchaseRate}%`;

  if (growing && repeating) {
    return `내부 거래에서는 거래처가 ${flow} 늘고 재구매율도 ${repeat}로 이어져, 새로 확보한 거래처와 기존 관계가 함께 유지되고 있습니다.`;
  }

  if (growing) {
    return `내부 거래에서는 거래처가 ${flow} 늘었지만 재구매율이 ${repeat}에 머물러, 새로 확보한 거래처가 반복 거래로 이어지는지는 아직 확인되지 않습니다.`;
  }

  if (repeating) {
    return `내부 거래에서는 거래처 수가 ${flow} 바뀌어 확장은 확인되지 않지만, 재구매율 ${repeat}로 기존 거래처와의 관계는 이어지고 있습니다.`;
  }

  return `내부 거래에서는 거래처가 ${flow} 바뀌고 재구매율은 ${repeat}로, 신규 확보와 관계 유지 어느 쪽에서도 뚜렷한 신호가 확인되지 않습니다.`;
}

// ── 거래처 의존 위험 ─────────────────────────────────────────
// 40%를 한 줄로 자르면 39%와 41%가 전혀 다른 결론이 된다. 구간을 넓히고
// 경계 근처는 경계라고 말한다.
function describeRisk(signals: Signals): string {
  const share = signals.topCustomerConcentration;
  const name = signals.topCustomerName ?? "최대 거래처";

  if (share === 0) {
    return "거래 금액이 확인되지 않아 거래처 의존 위험은 판단하지 않았습니다.";
  }

  if (share >= 70) {
    return `매출의 ${share}%가 ${name} 한 곳에서 나옵니다. 이 거래처의 사정이 바뀌면 그대로 전체 매출로 이어지므로, 다른 판로를 함께 살펴봐야 합니다.`;
  }

  if (share >= 50) {
    return `${josa(name, "이/가")} 매출의 ${share}%를 차지해 절반을 넘습니다. 성장세와 별개로 거래처 구성이 한쪽으로 기울어 있습니다.`;
  }

  if (share >= 40) {
    return `${name}의 비중이 ${share}%로 의존 위험 기준(40%)을 막 넘었습니다. 지금 당장 문제가 되는 수준은 아니지만 방향을 지켜볼 필요가 있습니다.`;
  }

  if (share >= 33) {
    return `${name}의 비중은 ${share}%로 의존 위험 기준(40%)에 가깝습니다. 아직 여유가 있을 때 거래처 구성을 살펴두면 좋습니다.`;
  }

  return `매출이 여러 거래처에 나뉘어 있고 가장 큰 ${name}도 ${share}%에 그쳐, 특정 거래처 의존 위험은 낮습니다.`;
}

// ── 한 줄 결론 ───────────────────────────────────────────────
// /compare 상단 강조 박스에 들어간다. 구간 이름만 조합하면 "외부 정보는
// 부족하지만 내부 거래에서는 부분적인 성장 신호가 확인되었습니다"처럼 어느
// 기업에나 붙는 말이 된다. 실제 수치를 근거로 넣고, 이 서비스가 무엇을
// 보여주려 하는지가 드러나게 쓴다.
//
// 이 제품의 존재 이유는 "밖에서 안 보이는데 안에서는 움직이는 기업"을 드러내는
// 것이다. 그 경우를 먼저 판별한다.
function buildHeadline(visibility: Visibility, signals: Signals): string {
  // 내부 자료가 없으면 "내부에서는 신호가 있다/없다"를 말할 수 없다.
  // 이 경우에는 외부에서 본 것만 말하고 판단은 미룬다.
  if (!signals.dataSufficient) {
    return `제출한 내부 거래가 ${signals.transactionCount}건이라 성장 신호를 판단하기에 부족합니다. 외부 공개 정보는 가시성 ${visibility.visibilityScore}점 수준으로 확인됩니다.`;
  }

  const invisible = visibility.visibilityScore < 30;
  const growing = signals.statuses.customerGrowthRate === "positive";
  const repeating = signals.statuses.repeatPurchaseRate === "positive";
  const share = signals.topCustomerConcentration;
  const name = signals.topCustomerName ?? "최대 거래처";

  const evidence = growing
    ? `거래처가 ${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로 늘었고`
    : `재구매율이 ${signals.repeatPurchaseRate}%로 이어지고`;

  // 밖에서는 안 보이는데 안에서는 신호가 있다 — 이 서비스가 겨냥한 상황이다.
  if (invisible && (growing || repeating)) {
    const risk =
      share >= 40
        ? ` 다만 매출의 ${share}%가 ${name} 한 곳에 몰려 있어 이 신호를 그대로 성장으로 읽기는 이릅니다.`
        : "";
    return `공개 정보로는 확인되지 않던 활동이 내부 거래에서는 드러납니다. ${evidence} 있습니다.${risk}`;
  }

  // 밖에서도 안에서도 흔적이 없다.
  if (invisible) {
    return `외부 공개 정보와 내부 거래 어느 쪽에서도 최근 성장 활동이 확인되지 않습니다. 자료가 더 쌓인 뒤에 다시 보시는 편이 정확합니다.`;
  }

  // 밖에는 보이는데 안이 비어 있다 — 노출과 실제 거래가 어긋난 경우다.
  if (!growing && !repeating) {
    return `외부에는 공개 정보가 남아 있지만(가시성 ${visibility.visibilityScore}점), 제출한 내부 거래에서는 성장 신호가 확인되지 않습니다.`;
  }

  // 양쪽 다 신호가 있다.
  const risk =
    share >= 40
      ? ` 다만 ${name} 비중이 ${share}%로 높아 성장의 기반이 한쪽에 쏠려 있습니다.`
      : ` ${name} 비중도 ${share}%로 특정 거래처 쏠림이 크지 않습니다.`;
  return `외부 공개 정보와 내부 거래 양쪽에서 활동이 확인됩니다. ${evidence} 있습니다.${risk}`;
}

// 성장 잠재력 등급: 긍정 판정을 받은 신호 개수로 정한다.
// (별도 기준을 새로 만들지 않고 statuses 판정을 그대로 집계한다.)
// 등급의 근거를 화면에서 그대로 안내한다.
// 긍정/주의 판정은 lib/signals.ts 가 정하고, 여기서는 개수를 등급으로만 옮긴다.
export const GRADE_NOTE =
  "여섯 신호 중 긍정 판정을 받은 개수로 매깁니다. 표본이 모자라 판단을 보류한 신호는 세지 않습니다.";

export const GRADE_CRITERIA = [
  { grade: "A", rule: "긍정 5개 이상" },
  { grade: "B+", rule: "긍정 4개" },
  { grade: "B", rule: "긍정 2~3개" },
  { grade: "C", rule: "긍정 1개 이하" },
  { grade: "—", rule: "평가 가능한 신호 3개 미만이면 등급 없음" },
];

// 지표가 여섯으로 늘었으므로 구간도 여섯 기준으로 나눈다.
// (셋일 때 쓰던 3개=A / 2개=B+ 를 그대로 두면 절반만 긍정이어도 B+ 가 된다.)
export function gradeFromSignals(signals: Signals): string {
  // 평가할 수 있는 지표가 모자라면 등급을 만들지 않는다. 긍정 개수만 보면
  // 거래가 없는 기업도 집중도 0%·지속성 100%로 "긍정 2개"를 받아 B가 된다.
  if (!signals.dataSufficient) {
    return "데이터 부족";
  }

  const positives = signals.positiveCount;

  if (positives >= 5) return "A";
  if (positives === 4) return "B+";
  if (positives >= 2) return "B";
  return "C";
}

// 무엇이 "긍정"인지 밝히지 않으면 활동 수준이 어디서 나온 값인지 알 수 없다.
export const POSITIVE_CRITERIA = [
  { label: "거래처 증가율", rule: "이전 기간보다 늘면 긍정" },
  { label: "거래금액 증가율", rule: "이전 기간보다 늘면 긍정" },
  { label: "재구매율", rule: `${REPEAT_GOOD}% 이상이면 긍정` },
  {
    label: "최대 거래처 집중도",
    rule: `${CONCENTRATION_WATCH}% 미만이면 긍정`,
  },
  { label: "거래 지속성", rule: `${CONTINUITY_GOOD}% 이상이면 긍정` },
  { label: "최근 추세", rule: "직전 구간보다 늘면 긍정" },
];

function buildInternalCardNote(signals: Signals): string {
  if (!signals.dataSufficient) {
    return "거래 자료가 부족해 성장 신호를 판단하지 않았습니다.";
  }

  const isGrowing = signals.statuses.customerGrowthRate === "positive";
  const isRepeating = signals.statuses.repeatPurchaseRate === "positive";

  if (isGrowing && isRepeating) {
    return "반복 거래와 거래처 확장 신호가 확인되었습니다.";
  }

  if (isGrowing) {
    return "거래처 확장 신호가 확인되었습니다.";
  }

  if (isRepeating) {
    return "반복 거래 신호가 확인되었습니다.";
  }

  return "뚜렷한 성장 신호는 확인되지 않았습니다.";
}

export function buildDiagnosis(
  visibility: Visibility,
  signals: Signals,
): Diagnosis {
  return {
    grade: gradeFromSignals(signals),
    headline: buildHeadline(visibility, signals),
    external: describeExternal(visibility),
    internal: describeInternal(signals),
    risk: describeRisk(signals),
    internalCardNote: buildInternalCardNote(signals),
  };
}
