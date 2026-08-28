import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateSignals } from "./signals.ts";
import { transactions } from "../data/transactions.ts";

// 자료가 부족할 때 성장 신호가 긍정으로 잡히던 문제를 막는다.
//
// 비율만 보고 표본을 보지 않으면 데이터가 없을수록 점수가 좋아진다.
//   거래 0건  → 집중도 0%   → "여러 거래처로 분산됨" (긍정)
//   거래 1건  → 지속성 1/1  → 100% "꾸준히 이어짐"  (긍정)
// 이 판정이 그대로 LLM 프롬프트로 넘어가 문장이 되면 읽는 쪽에서 걸러낼 방법이
// 없다. 그래서 계산 단계에서 막는다.
//
//   npm test

const row = (date: string, customer: string, amount: number) => ({
  companyId: "test",
  date,
  customer,
  item: "테스트",
  amount,
});

const find = (result: ReturnType<typeof calculateSignals>, key: string) => {
  const item = result.signals.find((signal) => signal.key === key);
  assert.ok(item, `${key} 신호가 없다`);
  return item;
};

describe("자료가 부족한 경우", () => {
  it("거래가 하나도 없으면 어떤 지표도 긍정이 아니다", () => {
    const result = calculateSignals([]);

    assert.equal(find(result, "concentration").evaluable, false);
    assert.equal(find(result, "continuity").evaluable, false);
    assert.equal(result.positiveCount, 0);
    assert.equal(result.dataSufficient, false);
    assert.equal(result.activityLevel, "데이터 부족");
  });

  it("거래가 1건이면 지속성 100%를 긍정으로 세지 않는다", () => {
    const result = calculateSignals([row("2026-03-05", "가나전자", 1_000_000)]);
    const continuity = find(result, "continuity");

    // 값 자체는 그대로 남긴다. 판정에만 쓰지 않는다.
    assert.equal(continuity.value, 100);
    assert.equal(continuity.evaluable, false);
    assert.notEqual(continuity.tone, "positive");
    assert.equal(result.positiveCount, 0);
    assert.equal(result.activityLevel, "데이터 부족");
  });

  it("금액이 모두 0원이면 집중도 0%를 분산으로 읽지 않는다", () => {
    const result = calculateSignals([
      row("2026-01-10", "가나전자", 0),
      row("2026-02-10", "다라산업", 0),
    ]);
    const concentration = find(result, "concentration");

    assert.equal(concentration.value, 0);
    assert.equal(concentration.evaluable, false);
    assert.notEqual(concentration.tone, "positive");
    assert.equal(result.positiveCount, 0);
    assert.equal(result.dataSufficient, false);
  });

  it("비교할 이전 기간이 없으면 증가율을 판정에 쓰지 않는다", () => {
    // 전부 최근 3개월 안에 몰려 있어 이전 기간이 비는 경우.
    const result = calculateSignals([
      row("2026-04-02", "가나전자", 3_000_000),
      row("2026-05-02", "다라산업", 4_000_000),
      row("2026-06-02", "마바정밀", 5_000_000),
    ]);
    const growth = find(result, "customerGrowth");

    assert.equal(result.previousCustomersCount, 0);
    assert.equal(growth.evaluable, false);
    assert.notEqual(growth.tone, "positive");
  });

  it("원본 개수는 결과에 그대로 남는다", () => {
    const result = calculateSignals([
      row("2026-01-10", "가나전자", 1_000),
      row("2026-02-10", "가나전자", 2_000),
    ]);

    assert.equal(result.transactionCount, 2);
    assert.equal(result.customerCount, 1);
    assert.equal(result.totalAmount, 3_000);
  });
});

describe("자료가 충분한 경우", () => {
  it("데모 기업 전부가 판정 가능하고 등급을 받는다", () => {
    const byCompany = new Map<string, typeof transactions>();
    for (const item of transactions) {
      const rows = byCompany.get(item.companyId) ?? [];
      rows.push(item);
      byCompany.set(item.companyId, rows);
    }

    assert.ok(byCompany.size >= 30, "데모 기업이 줄었다");

    for (const [companyId, rows] of byCompany) {
      const result = calculateSignals(rows);
      assert.equal(result.dataSufficient, true, `${companyId} 판정 불가`);
      assert.notEqual(result.activityLevel, "데이터 부족");
      // 정상 자료에서는 여섯 지표가 모두 평가된다. 여기가 깨지면 최소 표본
      // 기준이 실제 데이터에 비해 너무 빡빡하다는 뜻이다.
      assert.equal(result.evaluableCount, 6, `${companyId} 평가 지표 부족`);
    }
  });
});
