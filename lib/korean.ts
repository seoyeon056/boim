// 한국어 조사 선택.
//
// 문장을 값으로 조립하다 보면 "공시은", "한빛금속㈜가"처럼 조사가 어긋난다.
// 앞 글자의 받침 유무로 고른다. 완성형 한글은 (코드 - 0xAC00) % 28 이 0이면
// 받침이 없다.
//
// 숫자와 영문으로 끝나는 경우도 흔하다("2026년", "AI"). 읽는 소리를 기준으로
// 판단해야 해서 따로 표를 둔다.
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true, // 영
  "1": true, // 일
  "2": false, // 이
  "3": true, // 삼
  "4": false, // 사
  "5": false, // 오
  "6": true, // 육
  "7": true, // 칠
  "8": true, // 팔
  "9": false, // 구
};

// 알파벳은 이름 읽는 소리 기준(L=엘, M=엠 …)으로 받침 여부가 갈린다.
const LETTER_HAS_FINAL: Record<string, boolean> = {
  l: true, m: true, n: true, r: true, // 엘, 엠, 엔, 알
};

function hasFinalConsonant(word: string): boolean {
  const trimmed = word.replace(/[)\]）\s]+$/, "");
  const last = trimmed[trimmed.length - 1];
  if (!last) {
    return false;
  }

  const code = last.charCodeAt(0);

  // 완성형 한글
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }

  // "㈜"는 "주"로 읽어 받침이 없다.
  if (last === "㈜") {
    return false;
  }

  if (/\d/.test(last)) {
    return DIGIT_HAS_FINAL[last] ?? false;
  }

  const lower = last.toLowerCase();
  if (/[a-z]/.test(lower)) {
    return LETTER_HAS_FINAL[lower] ?? false;
  }

  return false;
}

// 앞말에 맞는 조사를 붙여 돌려준다. josa("공시", "은/는") -> "공시는"
export function josa(word: string, pair: string): string {
  const [withFinal, withoutFinal] = pair.split("/");
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}
