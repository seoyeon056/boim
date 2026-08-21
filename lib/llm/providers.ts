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
    });
    return completion.choices[0]?.message?.content ?? "";
}