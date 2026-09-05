import type { ExternalPresence, ExternalSource } from "@/data/visibility";

// 외부 가시성 계산 로직.
// 뉴스·특허·고용·공시를 입력으로 받아서 점수와 해석 문구를 만든다.
// 페이지가 문구를 직접 하드코딩하지 않도록 해석까지 여기서 책임진다.

// tone: "warn"(주황, 강조) = 정보 없음/부족 / "muted"(회색) = 흔적 일부 확인
export type MetricTone = "warn" | "muted";

export type VisibilityMetric = {
  key: "news" | "patent" | "employment" | "disclosure" | "visibility";
  label: string;
  value: string;
  interpretation: string;
  tone: MetricTone;
};

export type Visibility = {
  companyId: string;
  company: string;

  // 외부 API가 대답하지 않아 확인하지 못한 축. 여기 담긴 축의 건수는 0으로
  // 채워져 있지만 "없다"는 뜻이 아니므로, 화면·점수·진단서 어디서도 0건으로
  // 읽으면 안 된다.
  unavailable: ExternalSource[];

  newsCount: number;
  newsCountIsAtLeast?: boolean;
  patentCount: number;
  patentCountIsAtLeast?: boolean;
  employeeCount: number;
  employeeChange?: number;
  employmentAsOf?: string;
  disclosureCount: number;
  visibilityScore: number;

  interpretations: {
    news: string;
    patent: string;
    employment: string;
    disclosure: string;
    visibility: string;
  };

  metrics: VisibilityMetric[];
  summary: string;
  notice: string;
};

// 지표별 배점과 기준선.
//
// 예전에는 "건수 x 가중치"를 그대로 더하고 100에서 잘랐다. 합성 데이터(뉴스 0~2건)
// 기준으로 만든 식이라 그때는 맞았는데, 실제 API를 붙이면서 뉴스가 수천~수십만 건이
// 되자 점수가 사실상 0 아니면 100인 이진값이 됐다. 뉴스 9건이면 이미 100점이라
// 한빛정밀(가중합 168)과 LG생활건강(가중합 3,467,020)이 똑같이 100점이었다.
//
// 그래서 건수를 로그로 눌러서 0~1 사이 비율로 바꾼 뒤 배점을 곱한다. 자릿수가
// 달라질 때 점수가 움직이고, 같은 자릿수 안에서의 차이는 완만해진다.
//
// full = "이 정도면 그 축에서는 충분히 드러난 기업"으로 보는 기준선. 실측값을 보고
// 정했다(뉴스: 동일기연 3,627 / 아모텍 16,351 / 성우전자 4,764 — 실존 중소기업도
// 수천 건대라 500을 만점으로 잡아도 상한에 걸리지 않는 회사가 남는다. 특허: 동일기연
// 106. 공시: LG생활건강 68 / LG유플러스 75, 소규모 법인은 대부분 0).
//
// few = "소수 확인"과 "다수 확인"을 가르는 선. 기존 문구 구간(1~2건)도 합성 데이터
// 기준이라 실제 값에서는 전부 "다수"로 쏠렸다.
const METRICS = {
  news: { weight: 35, full: 500, few: 10 },
  patent: { weight: 25, full: 50, few: 3 },
  disclosure: { weight: 25, full: 30, few: 5 },
  // 고용은 건수가 아니라 사람 수다. 3인 이상 법인만 자료에 들어오므로 바닥이
  // 3명이고, 이 서비스가 보는 B2B 제조 중소기업은 대체로 두 자리다.
  employment: { weight: 15, full: 100, few: 10 },
} as const;

const NOTICE =
  "가시성 점수는 성장성 점수가 아니라 외부에서 확인 가능한 공개 정보 수준입니다.";

// 건수를 0~1 비율로 바꾼다. 0건은 0, 기준선 이상은 1.
function ratio(count: number, full: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.min(1, Math.log10(count + 1) / Math.log10(full + 1));
}

// 확인하지 못한 축은 배점에서 통째로 빼고, 남은 축의 배점만으로 100점을 만든다.
// 0점으로 계산하면 "특허를 못 불러왔다"가 "특허가 없다"와 같은 감점이 되어,
// 외부 API가 느린 날에 기업 평가가 낮아진다. 네 축이 다 살아 있으면 배점 합이
// 100이라 예전과 같은 점수가 나온다.
export function calculateVisibilityScore(presence: ExternalPresence): number {
  const unavailable = new Set(presence.unavailable ?? []);

  const axes = [
    ["news", presence.newsCount, METRICS.news],
    ["patent", presence.patentCount, METRICS.patent],
    ["disclosure", presence.disclosureCount ?? 0, METRICS.disclosure],
    ["employment", presence.employeeCount, METRICS.employment],
  ] as const;

  let earned = 0;
  let possible = 0;

  for (const [key, count, metric] of axes) {
    if (unavailable.has(key)) {
      continue;
    }
    earned += ratio(count, metric.full) * metric.weight;
    possible += metric.weight;
  }

  // 네 축을 하나도 확인하지 못한 경우. 점수를 지어내지 않는다.
  if (possible === 0) {
    return 0;
  }

  return Math.round((earned / possible) * 100);
}

// 해석 문구는 세 구간(없음 / 소수 확인 / 다수 확인)을 공유한다.
function band(count: number, few: number): "none" | "few" | "many" {
  if (count === 0) return "none";
  return count < few ? "few" : "many";
}

// 뉴스·특허가 0건인 건 이 서비스가 지적하려는 상태라 주황으로 강조한다.
// 고용·공시 기록 없음은 소규모 법인에서 정상이라 회색으로 둔다.
function interpretNews(count: number) {
  const level = band(count, METRICS.news.few);
  if (level === "none") {
    return { interpretation: "언론 노출 부족", tone: "warn" as const };
  }
  if (level === "few") {
    return { interpretation: "언론 노출 소수 확인", tone: "muted" as const };
  }
  return { interpretation: "언론 노출 다수 확인", tone: "muted" as const };
}

function interpretPatent(count: number) {
  const level = band(count, METRICS.patent.few);
  if (level === "none") {
    return { interpretation: "공개 기술 흔적 없음", tone: "warn" as const };
  }
  if (level === "few") {
    return {
      interpretation: "공개 기술 흔적 일부 확인",
      tone: "muted" as const,
    };
  }
  return { interpretation: "공개 기술 흔적 다수 확인", tone: "muted" as const };
}

// 규모와 증감을 한 문장에 담는다. 규모만 보면 오래된 회사가 늘 유리하고,
// 증감만 보면 3명이 4명 된 회사가 제일 좋아 보인다.
function interpretEmployment(count: number, change?: number) {
  if (count === 0) {
    // 3인 미만 법인은 국민연금 자료 자체에 안 들어온다. "고용이 없다"가 아니다.
    return { interpretation: "국민연금 가입 기록 없음", tone: "muted" as const };
  }

  const size = band(count, METRICS.employment.few) === "few" ? "소규모" : "일정 규모";

  if (change === undefined) {
    return { interpretation: `${size} 고용 확인`, tone: "muted" as const };
  }
  if (change > 0) {
    return {
      interpretation: `${size} 고용, 최근 6개월 ${change}명 증가`,
      tone: "muted" as const,
    };
  }
  if (change < 0) {
    return {
      interpretation: `${size} 고용, 최근 6개월 ${-change}명 감소`,
      tone: "warn" as const,
    };
  }
  return { interpretation: `${size} 고용, 최근 6개월 변동 없음`, tone: "muted" as const };
}

function interpretDisclosure(count: number) {
  const level = band(count, METRICS.disclosure.few);
  if (level === "none") {
    return { interpretation: "공시 기록 없음", tone: "muted" as const };
  }
  if (level === "few") {
    return { interpretation: "공시 기록 소수 확인", tone: "muted" as const };
  }
  return { interpretation: "공시 기록 다수 확인", tone: "muted" as const };
}

// 확인하지 못한 축은 건수 해석 대신 이 문구를 쓴다.
const UNAVAILABLE_METRIC = {
  value: "확인 불가",
  interpretation: "외부 서비스 응답 없음",
  tone: "warn" as const,
};

// 고용만 사유가 다르다. 국민연금 자료는 가입자 3인 이상 법인사업장부터 들어오고,
// 같은 이름의 회사가 둘 이상이면 어느 쪽인지 가릴 수 없어 판단을 접는다. 그런
// 경우까지 "응답 없음"이라고 적으면 서비스 장애처럼 읽힌다.
const UNAVAILABLE_EMPLOYMENT = {
  value: "확인 불가",
  interpretation: "국민연금 가입 사업장에서 찾지 못함",
  tone: "warn" as const,
};

// 공시도 사유가 다르다. DART는 회사명 검색을 지원하지 않아 고유번호를 먼저
// 찾아야 하는데, 등록 법인이 아니면 매핑표에 없다. 조회를 못 한 것이지
// 서비스가 죽은 것이 아니다.
const UNAVAILABLE_DISCLOSURE = {
  value: "확인 불가",
  interpretation: "전자공시 등록 법인에서 찾지 못함",
  tone: "warn" as const,
};

// 부르지 못한 것과 불러 봤는데 없는 것은 다르다.
//
// 예전에는 고용 축이 실패하면 사유와 무관하게 "국민연금 가입 사업장에서 찾지
// 못함"이라고 적었다. 국민연금이 시간 초과로 대답하지 않았을 때도 그렇게 적혀,
// 조회하지 못한 것을 조회해 봤더니 없더라고 말하는 셈이었다.
function unavailableFor(
  key: ExternalSource,
  reason?: "failed" | "not-found",
) {
  if (reason === "failed") {
    return UNAVAILABLE_METRIC;
  }
  if (key === "employment") return UNAVAILABLE_EMPLOYMENT;
  if (key === "disclosure") return UNAVAILABLE_DISCLOSURE;
  return UNAVAILABLE_METRIC;
}

// 60점 위가 전부 한 구간이라 100점에도 "일부 확인"이 붙었다. 네 축이 다 차서
// 만점이 나온 기업한테 할 말은 아니다. 실측 분포를 보고 85를 경계로 나눈다
// (한빛정밀 15 / 뉴스 100·특허 5·공시 3·소규모 고용 기업 52 / 동일기연급 87 /
// LG생활건강·삼성전자 85~100).
const AMPLE_SCORE = 85;

function interpretScore(score: number) {
  if (score < 30) {
    return { interpretation: "외부 정보 부족", tone: "warn" as const };
  }

  if (score < 60) {
    return { interpretation: "외부 정보 제한적", tone: "warn" as const };
  }

  if (score < AMPLE_SCORE) {
    return { interpretation: "외부 정보 일부 확인", tone: "muted" as const };
  }

  return { interpretation: "외부 정보 충분 확인", tone: "muted" as const };
}

// 점수 구간에 따라 화면 상단 설명 문구를 바꾼다.
function summarize(score: number): string {
  if (score < 30) {
    return "외부 데이터만으로는 최근 성장 활동을 확인하기 어렵습니다.";
  }

  if (score < 60) {
    return "외부 데이터에 흔적이 일부 남아 있지만, 최근 성장 활동을 판단하기에는 부족합니다.";
  }

  if (score < AMPLE_SCORE) {
    return "외부 데이터에 흔적이 남아 있지만, 내부 거래만큼 성장을 직접 보여주지는 않습니다.";
  }

  // 공개 정보가 충분한 기업에도 이 서비스의 전제는 그대로다. 공개 정보는
  // 활동의 결과가 드러난 뒤에야 쌓이므로, 최근 거래는 내부에서만 보인다.
  return "외부 데이터에 활동이 충분히 드러나 있습니다. 다만 공개 정보는 결과가 드러난 뒤에 쌓이므로, 최근 거래는 내부 데이터에서만 확인됩니다.";
}

export function calculateVisibility(
  companyName: string,
  presence: ExternalPresence,
): Visibility {
  const visibilityScore = calculateVisibilityScore(presence);
  const unavailable = presence.unavailable ?? [];
  const missing = new Set(unavailable);

  // 확인한 축만 건수로 해석하고, 못 부른 축은 "확인 불가"로 덮어쓴다.
  const metricFor = (
    key: ExternalSource,
    label: string,
    value: string,
    read: { interpretation: string; tone: MetricTone },
  ): VisibilityMetric =>
    missing.has(key)
      ? { key, label, ...unavailableFor(key, presence.unavailableReason?.[key]) }
      : { key, label, value, ...read };

  const news = interpretNews(presence.newsCount);
  const patent = interpretPatent(presence.patentCount);
  const employment = interpretEmployment(
    presence.employeeCount,
    presence.employeeChange,
  );
  const disclosureCount = presence.disclosureCount ?? 0;
  const disclosure = interpretDisclosure(disclosureCount);
  const visibility = interpretScore(visibilityScore);

  return {
    companyId: presence.companyId,
    company: companyName,
    unavailable,

    newsCount: presence.newsCount,
    newsCountIsAtLeast: presence.newsCountIsAtLeast,
    patentCount: presence.patentCount,
    patentCountIsAtLeast: presence.patentCountIsAtLeast,
    employeeCount: presence.employeeCount,
    employeeChange: presence.employeeChange,
    employmentAsOf: presence.employmentAsOf,
    disclosureCount,
    visibilityScore,

    interpretations: {
      // 해석 문구도 같이 덮는다. 여기만 "공개 기술 흔적 없음"으로 남으면
      // LLM 프롬프트와 진단서가 그 문장을 사실로 받아 적는다.
      news: missing.has("news")
        ? UNAVAILABLE_METRIC.interpretation
        : news.interpretation,
      patent: missing.has("patent")
        ? UNAVAILABLE_METRIC.interpretation
        : patent.interpretation,
      employment: missing.has("employment")
        ? unavailableFor("employment", presence.unavailableReason?.employment)
            .interpretation
        : employment.interpretation,
      disclosure: missing.has("disclosure")
        ? unavailableFor("disclosure", presence.unavailableReason?.disclosure)
            .interpretation
        : disclosure.interpretation,
      visibility: visibility.interpretation,
    },

    metrics: [
      // 실제 API를 붙이고 나서 건수가 수십만까지 올라간다. 자릿수 구분이 없으면
      // "288510건"처럼 읽을 수 없는 숫자가 화면에 그대로 나온다.
      metricFor(
        "news",
        "뉴스",
        `${presence.newsCount.toLocaleString()}건${presence.newsCountIsAtLeast ? " 이상" : ""}`,
        news,
      ),
      metricFor(
        "patent",
        "특허",
        `${presence.patentCount.toLocaleString()}건${presence.patentCountIsAtLeast ? " 이상" : ""}`,
        patent,
      ),
      metricFor(
        "employment",
        "고용 규모",
        `${presence.employeeCount.toLocaleString()}명`,
        employment,
      ),
      metricFor(
        "disclosure",
        "공시",
        `${disclosureCount.toLocaleString()}건`,
        disclosure,
      ),
      {
        key: "visibility",
        label: "가시성 점수",
        value: `${visibilityScore}점`,
        ...visibility,
      },
    ],

    summary: summarize(visibilityScore),
    notice: NOTICE,
  };
}
