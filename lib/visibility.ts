import type { ExternalPresence } from "@/data/visibility";

// 외부 가시성 계산 로직.
// 뉴스·특허·채용공고·공시 건수만 입력으로 받아서 점수와 해석 문구를 만든다.
// 페이지가 문구를 직접 하드코딩하지 않도록 해석까지 여기서 책임진다.

// tone: "warn"(주황, 강조) = 정보 없음/부족 / "muted"(회색) = 흔적 일부 확인
export type MetricTone = "warn" | "muted";

export type VisibilityMetric = {
  key: "news" | "patent" | "job" | "disclosure" | "visibility";
  label: string;
  value: string;
  interpretation: string;
  tone: MetricTone;
};

export type Visibility = {
  companyId: string;
  company: string;

  newsCount: number;
  newsCountIsAtLeast?: boolean;
  patentCount: number;
  patentCountIsAtLeast?: boolean;
  jobCount: number;
  disclosureCount: number;
  visibilityScore: number;

  interpretations: {
    news: string;
    patent: string;
    job: string;
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
  job: { weight: 15, full: 10, few: 2 },
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

export function calculateVisibilityScore(presence: ExternalPresence): number {
  const score =
    ratio(presence.newsCount, METRICS.news.full) * METRICS.news.weight +
    ratio(presence.patentCount, METRICS.patent.full) * METRICS.patent.weight +
    ratio(presence.disclosureCount ?? 0, METRICS.disclosure.full) *
      METRICS.disclosure.weight +
    ratio(presence.jobCount, METRICS.job.full) * METRICS.job.weight;

  return Math.round(score);
}

// 해석 문구는 세 구간(없음 / 소수 확인 / 다수 확인)을 공유한다.
function band(count: number, few: number): "none" | "few" | "many" {
  if (count === 0) return "none";
  return count < few ? "few" : "many";
}

// 뉴스·특허가 0건인 건 이 서비스가 지적하려는 상태라 주황으로 강조한다.
// 채용·공시 0건은 소규모 법인에서 정상이라 회색으로 둔다.
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

function interpretJob(count: number) {
  const level = band(count, METRICS.job.few);
  if (level === "none") {
    return { interpretation: "공개 채용 활동 없음", tone: "muted" as const };
  }
  if (level === "few") {
    return {
      interpretation: "공개 채용 활동 소수 확인",
      tone: "muted" as const,
    };
  }
  return { interpretation: "공개 채용 활동 확인", tone: "muted" as const };
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

function interpretScore(score: number) {
  if (score < 30) {
    return { interpretation: "외부 정보 부족", tone: "warn" as const };
  }

  if (score < 60) {
    return { interpretation: "외부 정보 제한적", tone: "warn" as const };
  }

  return { interpretation: "외부 정보 일부 확인", tone: "muted" as const };
}

// 점수 구간에 따라 화면 상단 설명 문구를 바꾼다.
function summarize(score: number): string {
  if (score < 30) {
    return "외부 데이터만으로는 최근 성장 활동을 확인하기 어렵습니다.";
  }

  if (score < 60) {
    return "외부 데이터에 흔적이 일부 남아 있지만, 최근 성장 활동을 판단하기에는 부족합니다.";
  }

  return "외부 데이터에 흔적이 남아 있지만, 내부 거래만큼 성장을 직접 보여주지는 않습니다.";
}

export function calculateVisibility(
  companyName: string,
  presence: ExternalPresence,
): Visibility {
  const visibilityScore = calculateVisibilityScore(presence);

  const news = interpretNews(presence.newsCount);
  const patent = interpretPatent(presence.patentCount);
  const job = interpretJob(presence.jobCount);
  const disclosureCount = presence.disclosureCount ?? 0;
  const disclosure = interpretDisclosure(disclosureCount);
  const visibility = interpretScore(visibilityScore);

  return {
    companyId: presence.companyId,
    company: companyName,

    newsCount: presence.newsCount,
    newsCountIsAtLeast: presence.newsCountIsAtLeast,
    patentCount: presence.patentCount,
    patentCountIsAtLeast: presence.patentCountIsAtLeast,
    jobCount: presence.jobCount,
    disclosureCount,
    visibilityScore,

    interpretations: {
      news: news.interpretation,
      patent: patent.interpretation,
      job: job.interpretation,
      disclosure: disclosure.interpretation,
      visibility: visibility.interpretation,
    },

    metrics: [
      {
        key: "news",
        label: "뉴스",
        value: presence.newsCountIsAtLeast
          ? `${presence.newsCount}건 이상`
          : `${presence.newsCount}건`,
        ...news,
      },
      {
        key: "patent",
        label: "특허",
        value: presence.patentCountIsAtLeast
          ? `${presence.patentCount}건 이상`
          : `${presence.patentCount}건`,
        ...patent,
      },
      {
        key: "job",
        label: "채용공고",
        value: `${presence.jobCount}건`,
        ...job,
      },
      {
        key: "disclosure",
        label: "공시",
        value: `${disclosureCount}건`,
        ...disclosure,
      },
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
