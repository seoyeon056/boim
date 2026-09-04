import OpenAI from "openai";

// LLM 호출을 이 모듈 하나로 격리한다.
// route.ts는 이 함수만 알면 되고, 내부적으로 어떤 provider를 쓰는지는 몰라도 된다.

// 모듈 로드 시점(빌드의 "Collecting page data" 단계 포함)에 클라이언트를 만들면
// OPENAI_API_KEY가 없을 때 그 자리에서 빌드가 죽는다. 그래서 호출 시점에만 생성한다.
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai;
}

export async function generateDiagnosisText(prompt: string): Promise<string> {
    const completion = await getOpenAI().chat.completions.create({
        model: "gpt-5-nano", // 2026-08 기준 가장 저렴한 범용 채팅 모델 (입력 $0.05, 출력 $0.40 / 100만 토큰)
        messages: [{ role: "user", content: prompt }],
        // 판단은 코드가 이미 끝냈고 여기서 맡기는 일은 "정해진 판정을 문장으로
        // 옮기는 것"뿐이다. 기본값으로 두면 모델이 필요 이상으로 오래 생각한다.
        //
        // 같은 프롬프트로 재보니 가시성 문장 10.8초 → 3.0초, 진단서 종합 의견
        // 23.8초 → 10.6초였다. 문장 품질은 떨어지지 않았고 오히려 지침을 더 잘
        // 지켰다(기본값은 "반복거래율"을 "재구매"로 바꿔 쓰는 일이 있었다).
        //
        // "minimal" 은 1.2초로 더 빠르지만 근거 없는 문장이 섞여 쓰지 않는다.
        reasoning_effort: "low",
    });
    return completion.choices[0]?.message?.content ?? "";
}