// 늦으면 한 번 더 띄우고, 먼저 답하는 쪽을 쓴다.
//
// 외부 공개 API 는 같은 요청이 어느 날은 1초에 오고 어느 날은 20초를 넘긴다
// (실측: KIPRIS 특허 조회가 같은 요청에 0.44초~20초 시간 초과까지 흔들렸다).
// 왜 느린지는 그쪽 사정이라 우리가 알 수 없다. 그래서 느릴 때를 전제로 둔다.
//
// "실패한 뒤 다시 부르기"는 이런 경우에 도움이 안 된다. 실패를 확인하려면 제한
// 시간까지 기다려야 하고, 그러고 나서 다시 부르면 총 대기가 두 배가 된다.
// 대신 첫 요청을 취소하지 않고, 정해진 시간 안에 답이 없으면 한 번 더 띄운다.
// 늦은 첫 요청이 끝내 답하지 않아도 두 번째가 대신 답한다.
//
// 평소에는 두 번째 요청 자체가 나가지 않는다. 문턱을 평소 응답 시간보다
// 넉넉히 위에 두기 때문이다.

const SLOW = Symbol("slow");

// 여러 시도 중 먼저 값을 주는 것 하나. 전부 실패하면 마지막 오류를 던진다.
function firstAnswer<T>(attempts: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let remaining = attempts.length;
    let done = false;
    let lastError: unknown;

    for (const attempt of attempts) {
      attempt.then(
        (value) => {
          if (done) return;
          done = true;
          resolve(value);
        },
        (error) => {
          if (done) return;
          lastError = error;
          if (--remaining === 0) {
            done = true;
            reject(lastError);
          }
        },
      );
    }
  });
}

/**
 * `run()` 을 부르고, `retryAfterMs` 안에 답이 없으면 한 번 더 부른다.
 * 먼저 값을 주는 쪽을 돌려주고, 둘 다 실패하면 오류를 던진다.
 */
export async function runTwiceIfSlow<T>(
  run: () => Promise<T>,
  retryAfterMs: number,
): Promise<T> {
  const first = run();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<typeof SLOW>((resolve) => {
    timer = setTimeout(() => resolve(SLOW), retryAfterMs);
  });

  try {
    // 첫 요청이 먼저 끝나면 그대로 쓴다. 실패로 끝났으면 곧바로 한 번 더 띄운다.
    const early = await Promise.race([
      first.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      ),
      slow,
    ]);

    if (early !== SLOW && early.ok) {
      return early.value;
    }

    // 첫 요청을 버리지 않는다. 늦게라도 오면 그쪽이 이길 수 있다.
    return await firstAnswer([first, run()]);
  } finally {
    // 서버리스 환경에서 남은 타이머가 함수 종료를 늦추지 않도록 정리한다.
    clearTimeout(timer);
  }
}
