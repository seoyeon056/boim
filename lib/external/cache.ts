// 외부 조회 결과를 잠깐 기억해 둔다.
//
// 한 번의 진단에서 같은 기업의 외부 정보를 세 번 부른다. Step 02(외부 가시성),
// Step 05(외부와 내부 비교), Step 06(진단서)이 각각 서버에서 처음부터 다시
// 조회한다. 실측으로 비교 화면이 8~9초, 가시성 화면이 25초 걸렸다. 버튼을
// 누르고 아무 일도 일어나지 않는 것처럼 보이는 시간이다.
//
// 실패는 기억하지 않는다. 국민연금 조회는 간헐적으로 타임아웃하는데(12회 중 1회,
// 그것도 첫 호출) 그 실패를 캐시에 넣으면 "확인 불가"가 몇 분씩 굳는다. 성공한
// 축만 담아 두면 실패한 축은 다음 화면에서 다시 물어보게 되고, 화면끼리 값이
// 어긋나는 일도 없다.
//
// 프로세스 안에서만 산다. 배포본은 인스턴스마다 따로 가지지만, 한 사람이 단계를
// 넘어가는 몇 분 동안은 같은 인스턴스가 받는다. 여기서 노리는 것이 그 구간이다.

const TTL_MS = 5 * 60 * 1000;

// 실패한 조회를 기억해 두는 짧은 시간.
//
// 실패를 아예 기억하지 않으면 화면을 오갈 때마다 같은 실패를 처음부터 다시
// 기다린다. 실측(국민연금이 불안정한 시간대, 한빛정밀): 같은 조회가 1회차
// 14.2초, 2회차 14.2초 — 되돌아가기가 매번 느린 이유가 이것이었다.
//
// 그렇다고 5분을 두면 잠깐의 장애가 "확인 불가"로 몇 분씩 굳는다. 한 흐름 안에서
// 화면을 오가는 동안만 덮도록 짧게 잡는다. 이 시간이 지나면 다시 물어본다.
const FAIL_TTL_MS = 30 * 1000;

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

// 진행 중인 호출도 같이 기억한다. 같은 값을 동시에 두 번 부르지 않는다.
const inFlight = new Map<string, Promise<unknown>>();

function sweep(now: number) {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

// 이 값을 얼마나 기억할지. 0 이면 기억하지 않는다.
//
// 성공은 5분, 실패는 30초다. 둘을 가르는 이유는 성격이 다르기 때문이다.
// 성공한 값은 잠시 뒤에도 같을 것이므로 오래 두어도 된다. 실패는 그쪽 사정이라
// 곧 풀릴 수 있으니 오래 두면 안 되지만, 아예 안 두면 화면을 오갈 때마다 같은
// 실패를 처음부터 다시 기다리게 된다.
function keepFor(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "object" && "status" in value) {
    return (value as { status: unknown }).status === "failed" ? FAIL_TTL_MS : TTL_MS;
  }
  return TTL_MS;
}

/**
 * `load()` 의 결과를 `key` 로 기억한다. null·undefined 는 기억하지 않고,
 * 실패(`status: "failed"`)는 30초만, 나머지는 5분 동안 기억한다.
 */
export async function remember<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const running = inFlight.get(key);
  if (running) {
    return running as Promise<T>;
  }

  const pending = load()
    .then((value) => {
      const ttl = keepFor(value);
      if (ttl > 0) {
        sweep(now);
        store.set(key, { value, expiresAt: Date.now() + ttl });
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

// 테스트에서 상태를 비운다.
export function clearExternalCache() {
  store.clear();
  inFlight.clear();
}
