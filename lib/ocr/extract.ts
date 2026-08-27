// Upstage Information Extract API로 거래명세서에서 거래 내역을 구조화 추출한다.
// https://console.upstage.ai/docs/capabilities/extract/universal-extraction
//
// 문서에는 confidence:true를 주면 tool_calls.additional_values 안에
// high/low 2단계로만 온다고 되어 있는데, 실측해보니 응답 최상위에
// confidence_score라는 필드가 따로 있고 여기엔 필드별 0~1 사이 실수 신뢰도가
// 그대로 들어있다(문서보다 더 정밀한 값). review 화면이 숫자 신뢰도를 쓰므로
// 이 값을 그대로 쓴다.
const ENDPOINT =
  "https://api.upstage.ai/v1/information-extraction/chat/completions";

const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "transaction_statement",
    schema: {
      type: "object",
      properties: {
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "거래 날짜 (YYYY-MM-DD)" },
              customer: { type: "string", description: "거래처명(상호명)" },
              item: { type: "string", description: "거래 품목" },
              amount: { type: "number", description: "거래 금액(원, 숫자만)" },
            },
          },
        },
      },
    },
  },
} as const;

type ExtractedTransaction = {
  date: string;
  customer: string;
  item: string;
  amount: number;
};

type ConfidenceEntry = {
  date?: number;
  customer?: number;
  item?: number;
  amount?: number;
};

export type ExtractedField<T> = { value: T; confidence: number };

export type ExtractedTransactionRow = {
  date: ExtractedField<string>;
  customer: ExtractedField<string>;
  item: ExtractedField<string>;
  amount: ExtractedField<number>;
};

// 신뢰도를 못 받아온 경우의 기본값. review 화면 기준(0.95 이상=자동확인)보다
// 낮게 잡아서, 근거 불명확한 값은 사용자가 한 번 더 확인하도록 유도한다.
const DEFAULT_CONFIDENCE = 0.7;

function toRow(
  transaction: ExtractedTransaction,
  confidence?: ConfidenceEntry,
): ExtractedTransactionRow {
  return {
    date: {
      value: transaction.date,
      confidence: confidence?.date ?? DEFAULT_CONFIDENCE,
    },
    customer: {
      value: transaction.customer,
      confidence: confidence?.customer ?? DEFAULT_CONFIDENCE,
    },
    item: {
      value: transaction.item,
      confidence: confidence?.item ?? DEFAULT_CONFIDENCE,
    },
    amount: {
      value: transaction.amount,
      confidence: confidence?.amount ?? DEFAULT_CONFIDENCE,
    },
  };
}

// 파일 하나(거래명세서 이미지/PDF)를 거래 내역 목록으로 구조화 추출한다.
// 키가 없거나 호출이 실패하면 null — 호출하는 쪽이 합성 데이터로 대체한다.
export async function extractTransactionsFromFile(
  file: File,
): Promise<ExtractedTransactionRow[] | null> {
  const apiKey = process.env.UPSTAGE_API_KEY;

  if (!apiKey) {
    return null;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "information-extract",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/octet-stream;base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: SCHEMA,
        confidence: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      choices?: {
        message?: { content?: string };
        confidence_score?: string;
      }[];
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as {
      transactions?: ExtractedTransaction[];
    };
    const transactions = parsed.transactions ?? [];

    // confidence_score는 응답 최상위가 아니라 choices[0] 안에 있다(실측 확인).
    const confidenceList = choice.confidence_score
      ? (JSON.parse(choice.confidence_score) as {
          transactions?: ConfidenceEntry[];
        }).transactions
      : undefined;

    return transactions.map((transaction, index) =>
      toRow(transaction, confidenceList?.[index]),
    );
  } catch {
    // 네트워크 오류, 타임아웃, 문서 파싱 실패 등 — 화면은 합성 데이터로 계속 동작해야 한다.
    return null;
  }
}
