import type { Signals } from "@/lib/signals";
import type { Visibility } from "@/lib/visibility";

// BO:IM 종합 진단 문장.
// 지표는 기업마다 다른데 결론 문장이 고정이면 화면 안에서 앞뒤가 안 맞는다.
// (예: 가시성 62점인데 "외부 정보는 부족하지만"이라고 말하는 상황)
// 그래서 문장도 계산된 값에서 고른다.

export type Diagnosis = {
  grade: string; // 성장 잠재력 등급
  headline: string; // 결론 한 문장
  external: string; // 외부에서 본 모습
  internal: string; // 내부에서 본 모습
  risk: string; // 거래처 집중도 관련
  internalCardNote: string; // 비교 화면 내부(초록) 카드 하단 요약
};

// 외부: 가시성 점수 구간으로 나눈다. (lib/visibility.ts 의 구간과 동일)
function describeExternal(score: number): string {
  if (score < 30) {
    return "외부에서는 공개 정보가 거의 없어 기업의 최근 성장 활동을 확인하기 어렵습니다.";
  }

  if (score < 60) {
    return "외부에는 공개 정보가 일부 있지만, 최근 성장 활동을 판단하기에는 부족합니다.";
  }

  return "외부에도 공개 정보가 어느 정도 남아 있지만, 그것만으로는 최근 성장 활동을 확인하기 어렵습니다.";
}

// 내부: 거래처 증가와 반복 거래를 조합해서 판단한다.
function describeInternal(signals: Signals): string {
  const isGrowing = signals.statuses.customerGrowthRate === "positive";
  const isRepeating = signals.statuses.repeatPurchaseRate === "positive";

  if (isGrowing && isRepeating) {
    return "내부 문서에서는 거래처 증가와 반복 거래 신호가 함께 확인되었습니다.";
  }

  if (isGrowing) {
    return "내부 문서에서는 거래처가 늘었지만, 반복 거래 비중은 아직 낮습니다.";
  }

  if (isRepeating) {
    return "내부 문서에서는 거래처 수가 늘지는 않았지만, 반복 거래는 안정적으로 이어지고 있습니다.";
  }

  return "내부 문서에서도 뚜렷한 성장 신호는 확인되지 않았습니다.";
}

// 집중도: 위험 구간일 때만 경고 문장을 쓴다.
function describeRisk(signals: Signals): string {
  const isRisky = signals.statuses.topCustomerConcentration === "caution";
  const name = signals.topCustomerName ?? "최대 거래처";

  if (isRisky) {
    return `다만 최대 거래처인 ${name}가 전체 매출의 ${signals.topCustomerConcentration}%를 차지해 특정 거래처 의존 위험을 함께 살펴봐야 합니다.`;
  }

  return `최대 거래처인 ${name}의 비중은 ${signals.topCustomerConcentration}%로, 특정 거래처 의존 위험은 크지 않습니다.`;
}

function buildHeadline(visibility: Visibility, signals: Signals): string {
  const externalPart =
    visibility.visibilityScore < 30
      ? "외부 정보는 부족하지만"
      : visibility.visibilityScore < 60
        ? "외부 정보만으로는 판단이 어렵지만"
        : "외부 정보에도 흔적이 일부 남아 있고";

  const isGrowing = signals.statuses.customerGrowthRate === "positive";
  const isRepeating = signals.statuses.repeatPurchaseRate === "positive";

  const internalPart =
    isGrowing && isRepeating
      ? "내부 거래에서는 뚜렷한 성장 신호가 확인되었습니다."
      : isGrowing || isRepeating
        ? "내부 거래에서는 부분적인 성장 신호가 확인되었습니다."
        : "내부 거래에서도 뚜렷한 성장 신호는 확인되지 않았습니다.";

  const topCustomer = signals.topCustomerName ?? "최대 거래처";

  const riskPart =
    signals.statuses.topCustomerConcentration === "caution"
      ? ` 다만 ${topCustomer}에 대한 거래처 의존 위험은 함께 살펴봐야 합니다.`
      : ` 최대 거래처인 ${topCustomer}의 비중은 ${signals.topCustomerConcentration}%로 부담이 크지 않습니다.`;

  return `${externalPart}, ${internalPart}${riskPart}`;
}

// 성장 잠재력 등급: 긍정 판정을 받은 신호 개수로 정한다.
// (별도 기준을 새로 만들지 않고 statuses 판정을 그대로 집계한다.)
function buildGrade(signals: Signals): string {
  const positives = Object.values(signals.statuses).filter(
    (tone) => tone === "positive",
  ).length;

  if (positives >= 3) return "A";
  if (positives === 2) return "B+";
  if (positives === 1) return "B";
  return "C";
}

function buildInternalCardNote(signals: Signals): string {
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
    grade: buildGrade(signals),
    headline: buildHeadline(visibility, signals),
    external: describeExternal(visibility.visibilityScore),
    internal: describeInternal(signals),
    risk: describeRisk(signals),
    internalCardNote: buildInternalCardNote(signals),
  };
}
