import type { Transaction } from "@/data/transactions";

// 내부 거래 신호.
//
// LLM이 "이 기업 좋아 보이는데?" 하고 알아서 판단하지 않는다. 무엇을 볼지와
// 어떻게 셀지를 코드가 정해 놓고, 같은 데이터에는 항상 같은 결론이 나오게 한다.
// LLM은 그 결과를 문장으로 옮기는 일만 맡는다.
//
// 여섯 가지를 본다.
//   1) 거래처가 늘었는가          거래처 증가율
//   2) 거래 규모가 늘었는가       거래금액 증가율
//   3) 한 번 거래하고 마는가      반복거래율
//   4) 한 곳에 쏠려 있는가        거래처 집중도
//   5) 꾸준히 거래하는가          거래 지속성
//   6) 최근에 오르는가 내리는가   최근 추세

export type SignalTone = "positive" | "neutral" | "caution";

export type SignalKey =
  | "customerGrowth"
  | "amountGrowth"
  | "repeatRate"
  | "concentration"
  | "continuity"
  | "trend";

export type SignalItem = {
  key: SignalKey;
  label: string;
  value: number;
  prefix: string;
  suffix: string;
  // 그 수치가 어디서 나왔는지 (이전 10곳 → 최근 13곳)
  detail: string;
  // 그래서 무엇인지 (신규 거래처 확대 신호)
  note: string;
  tone: SignalTone;
};

// 예전에는 "1~3월이 이전, 4월 이후가 최근"으로 못 박혀 있었다. 데모 데이터가
// 2026년 상반기였기 때문인데, 사용자가 8월 거래명세서를 올리면 전부 "최근"으로
// 몰려 이전 기간이 비고 증가율이 늘 0이 된다.
// 가장 최근 거래일을 기준으로 3개월씩 끊으면 어떤 기간의 문서든 동작한다.
const WINDOW_MONTHS = 3;

function monthIndex(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return year * 12 + (month - 1);
}

type Split = {
  previous: Transaction[];
  recent: Transaction[];
  latestMonth: number;
  earliestMonth: number;
};

function splitPeriods(items: Transaction[]): Split {
  const months = items.map((item) => monthIndex(item.date));
  const latestMonth = months.length > 0 ? Math.max(...months) : 0;
  const earliestMonth = months.length > 0 ? Math.min(...months) : 0;
  const recentFrom = latestMonth - (WINDOW_MONTHS - 1);
  const previousFrom = recentFrom - WINDOW_MONTHS;

  return {
    recent: items.filter((item) => monthIndex(item.date) >= recentFrom),
    previous: items.filter((item) => {
      const at = monthIndex(item.date);
      return at >= previousFrom && at < recentFrom;
    }),
    latestMonth,
    earliestMonth,
  };
}

function customersOf(items: Transaction[]): Set<string> {
  return new Set(items.map((item) => item.customer));
}

function sumAmount(items: Transaction[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

// 이전 기간이 비어 있으면 증가율을 계산할 수 없다. 무한대 대신 0으로 두고,
// 판정에서 "비교할 이전 기간이 없다"로 따로 다룬다.
function growthRate(previous: number, recent: number): number {
  if (previous === 0) {
    return 0;
  }
  return Number((((recent - previous) / previous) * 100).toFixed(1));
}

export function countCustomers(items: Transaction[]): number {
  return customersOf(items).size;
}

export function calculateRepeatPurchaseRate(items: Transaction[]): number {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.customer, (counts.get(item.customer) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return 0;
  }
  const repeat = [...counts.values()].filter((count) => count >= 2).length;
  return Number(((repeat / counts.size) * 100).toFixed(1));
}

export function calculateTopCustomerConcentration(items: Transaction[]) {
  const byCustomer = new Map<string, number>();
  for (const item of items) {
    byCustomer.set(
      item.customer,
      (byCustomer.get(item.customer) ?? 0) + item.amount,
    );
  }

  const total = [...byCustomer.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (total === 0) {
    return {
      topCustomerName: null as string | null,
      topCustomerConcentration: 0,
    };
  }

  let topCustomerName: string | null = null;
  let topAmount = 0;
  for (const [name, amount] of byCustomer) {
    if (amount > topAmount) {
      topCustomerName = name;
      topAmount = amount;
    }
  }

  return {
    topCustomerName,
    topCustomerConcentration: Number(((topAmount / total) * 100).toFixed(1)),
  };
}

// 거래가 특정 달에 몰려 있는지 꾸준한지를 본다.
// 관측 기간 중 실제로 거래가 있었던 달의 비율이다.
function calculateContinuity(items: Transaction[], split: Split) {
  if (items.length === 0) {
    return { rate: 0, activeMonths: 0, observedMonths: 0 };
  }
  const activeMonths = new Set(items.map((item) => monthIndex(item.date))).size;
  const observedMonths = split.latestMonth - split.earliestMonth + 1;
  return {
    rate: Number(((activeMonths / observedMonths) * 100).toFixed(1)),
    activeMonths,
    observedMonths,
  };
}

// 마지막 달의 거래금액을 그 앞 달들의 평균과 비교한다.
// 3개월 단위 증가율보다 짧은 호흡의 변화를 잡는다.
function calculateTrend(items: Transaction[], split: Split) {
  const byMonth = new Map<number, number>();
  for (const item of items) {
    const at = monthIndex(item.date);
    byMonth.set(at, (byMonth.get(at) ?? 0) + item.amount);
  }

  const lastAmount = byMonth.get(split.latestMonth) ?? 0;
  const earlier = [...byMonth.entries()].filter(
    ([at]) => at < split.latestMonth,
  );

  if (earlier.length === 0) {
    return { rate: 0, comparable: false, lastAmount, averageAmount: 0 };
  }

  const averageAmount =
    earlier.reduce((sum, [, amount]) => sum + amount, 0) / earlier.length;

  return {
    rate: growthRate(averageAmount, lastAmount),
    comparable: true,
    lastAmount,
    averageAmount,
  };
}

// 값에서 판정을 만든다. 화면에서 "긍정"을 하드코딩하면 다른 기업에서 틀린 표시가 된다.
export const REPEAT_GOOD = 50;
export const REPEAT_WEAK = 30;
export const CONCENTRATION_RISK = 40;
export const CONCENTRATION_WATCH = 25;
export const CONTINUITY_GOOD = 70;
export const CONTINUITY_WEAK = 40;

function toneByGrowth(rate: number, comparable: boolean): SignalTone {
  if (!comparable) return "neutral";
  if (rate > 0) return "positive";
  if (rate === 0) return "neutral";
  return "caution";
}

function toneByBand(value: number, good: number, weak: number): SignalTone {
  if (value >= good) return "positive";
  if (value >= weak) return "neutral";
  return "caution";
}

function won(amount: number): string {
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(1) + "억";
  }
  if (amount >= 10000) {
    return Math.round(amount / 10000).toLocaleString() + "만";
  }
  return amount.toLocaleString();
}

export function calculateSignals(items: Transaction[]) {
  const split = splitPeriods(items);

  const previousCustomers = customersOf(split.previous).size;
  const recentCustomers = customersOf(split.recent).size;
  const customerGrowthRate = growthRate(previousCustomers, recentCustomers);

  const previousAmount = sumAmount(split.previous);
  const recentAmount = sumAmount(split.recent);
  const amountGrowthRate = growthRate(previousAmount, recentAmount);

  const repeatPurchaseRate = calculateRepeatPurchaseRate(items);
  const top = calculateTopCustomerConcentration(items);
  const continuity = calculateContinuity(items, split);
  const trend = calculateTrend(items, split);
  const customerCount = countCustomers(items);

  const repeatCustomers = [...customersOf(items)].filter(
    (name) => items.filter((item) => item.customer === name).length >= 2,
  ).length;

  const statuses = {
    customerGrowthRate: toneByGrowth(customerGrowthRate, previousCustomers > 0),
    amountGrowthRate: toneByGrowth(amountGrowthRate, previousAmount > 0),
    repeatPurchaseRate: toneByBand(repeatPurchaseRate, REPEAT_GOOD, REPEAT_WEAK),
    topCustomerConcentration: (top.topCustomerConcentration >= CONCENTRATION_RISK
      ? "caution"
      : top.topCustomerConcentration >= CONCENTRATION_WATCH
        ? "neutral"
        : "positive") as SignalTone,
    continuity: toneByBand(continuity.rate, CONTINUITY_GOOD, CONTINUITY_WEAK),
    trend: toneByGrowth(trend.rate, trend.comparable),
  };

  const signals: SignalItem[] = [
    {
      key: "customerGrowth",
      label: "거래처 증가율",
      value: customerGrowthRate,
      prefix: customerGrowthRate > 0 ? "+" : "",
      suffix: "%",
      detail: `이전 ${previousCustomers}곳 → 최근 ${recentCustomers}곳`,
      note:
        statuses.customerGrowthRate === "positive"
          ? "신규 거래처 확대 신호"
          : statuses.customerGrowthRate === "neutral"
            ? "거래처 수에 변화가 없음"
            : "거래처가 줄었음",
      tone: statuses.customerGrowthRate,
    },
    {
      key: "amountGrowth",
      label: "거래금액 증가율",
      value: amountGrowthRate,
      prefix: amountGrowthRate > 0 ? "+" : "",
      suffix: "%",
      detail: `이전 ${won(previousAmount)} → 최근 ${won(recentAmount)}`,
      note:
        statuses.amountGrowthRate === "positive"
          ? "거래 규모 확대 신호"
          : statuses.amountGrowthRate === "neutral"
            ? "거래 규모에 변화가 없음"
            : "거래 규모가 줄었음",
      tone: statuses.amountGrowthRate,
    },
    {
      key: "repeatRate",
      label: "반복거래율",
      value: repeatPurchaseRate,
      prefix: "",
      suffix: "%",
      detail: `전체 ${customerCount}곳 중 2회 이상 ${repeatCustomers}곳`,
      note:
        statuses.repeatPurchaseRate === "positive"
          ? "거래 관계가 비교적 안정적"
          : statuses.repeatPurchaseRate === "neutral"
            ? "반복 거래가 일부만 확인됨"
            : "한 번 거래하고 끝나는 경우가 많음",
      tone: statuses.repeatPurchaseRate,
    },
    {
      key: "concentration",
      label: "최대 거래처 집중도",
      value: top.topCustomerConcentration,
      prefix: "",
      suffix: "%",
      detail: top.topCustomerName
        ? `${top.topCustomerName} 비중`
        : "거래 금액을 확인하지 못함",
      note:
        statuses.topCustomerConcentration === "caution"
          ? "특정 거래처 의존 위험"
          : statuses.topCustomerConcentration === "neutral"
            ? "한 거래처 비중이 다소 높음"
            : "여러 거래처로 분산됨",
      tone: statuses.topCustomerConcentration,
    },
    {
      key: "continuity",
      label: "거래 지속성",
      value: continuity.rate,
      prefix: "",
      suffix: "%",
      detail: `${continuity.observedMonths}개월 중 ${continuity.activeMonths}개월에 거래 발생`,
      note:
        statuses.continuity === "positive"
          ? "거래가 꾸준히 이어짐"
          : statuses.continuity === "neutral"
            ? "거래가 끊긴 달이 있음"
            : "거래가 특정 시기에 몰려 있음",
      tone: statuses.continuity,
    },
    {
      key: "trend",
      label: "최근 추세",
      value: trend.rate,
      prefix: trend.rate > 0 ? "+" : "",
      suffix: "%",
      detail: trend.comparable
        ? `이전 달 평균 ${won(trend.averageAmount)} → 최근 달 ${won(trend.lastAmount)}`
        : "비교할 이전 달이 없음",
      note: !trend.comparable
        ? "추세를 판단하기에 기간이 짧음"
        : statuses.trend === "positive"
          ? "최근 거래가 늘어나는 중"
          : statuses.trend === "neutral"
            ? "최근 거래가 이전과 비슷함"
            : "최근 거래가 줄어드는 중",
      tone: statuses.trend,
    },
  ];

  const positiveCount = signals.filter(
    (item) => item.tone === "positive",
  ).length;
  const cautionCount = signals.filter((item) => item.tone === "caution").length;

  // 여섯 신호 중 몇 개가 긍정인지로 활동 수준을 정한다.
  const activityLevel =
    positiveCount >= 4 ? "활발" : positiveCount >= 2 ? "보통" : "저조";

  return {
    previousCustomersCount: previousCustomers,
    recentCustomersCount: recentCustomers,
    customerCount,

    customerGrowthRate,
    amountGrowthRate,
    previousAmount,
    recentAmount,
    repeatPurchaseRate,
    topCustomerConcentration: top.topCustomerConcentration,
    topCustomerName: top.topCustomerName,
    continuityRate: continuity.rate,
    activeMonths: continuity.activeMonths,
    observedMonths: continuity.observedMonths,
    trendRate: trend.rate,
    trendComparable: trend.comparable,

    statuses,
    signals,
    positiveCount,
    cautionCount,
    activityLevel,
  };
}

export type Signals = ReturnType<typeof calculateSignals>;
