import OpenAI from "openai";

// LLM 호출을 이 모듈 하나로 격리한다.
// route.ts는 이 함수만 알면 되고, 내부적으로 어떤 provider를 쓰는지는 몰라도 된다.

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateDiagnosisText(prompt: string): Promise<string> {
    const completion = await openai.chat.completions.create({
        model: "gpt-5-nano", // 2026-08 기준 가장 저렴한 범용 채팅 모델 (입력 $0.05, 출력 $0.40 / 100만 토큰)
        messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
}