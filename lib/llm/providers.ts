import OpenAI from "openai";

// LLM 호출을 이 모듈 하나로 격리한다.
// route.ts는 이 함수만 알면 되고, 내부적으로 어떤 provider를 쓰는지는 몰라도 된다.

// 모듈 로드 시점(빌드의 "Collecting page data" 단계 포함)에 클라이언트를 만들면
// OPENAI_API_KEY가 없을 때 그 자리에서 빌드가 죽는다. 그래서 호출 시점에만 생성한다.
let openai: OpenAI | null = null;

// 응답이 늦어지거나 멈춰도 화면이 무한정 기다리지 않도록 상한을 둔다.
//
// 실측으로 같은 프롬프트가 3초에 오기도 하고 16초가 걸리기도 했다. 상한이
// 없으면 한 번 멈춘 호출이 화면을 끝까지 붙잡는다. 시간이 지나면 호출을
// 포기하고 규칙 기반 문장으로 돌아간다(화면은 그 문장을 이미 갖고 있다).
//
// 재시도는 하지 않는다. 이 SDK 는 시간 초과도 재시도 대상으로 보기 때문에
// 기본값(2회)을 두면 최악의 경우 상한의 세 배를 기다리게 되어 상한을 둔
// 의미가 없어진다. 문장은 있으면 좋은 것이고 없을 때 쓸 문장이 이미 있으므로,
// 한 번 실패하면 그대로 규칙 기반 문장으로 넘어간다.
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 0;

function getOpenAI(): OpenAI {
    openai ??= new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
    });
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