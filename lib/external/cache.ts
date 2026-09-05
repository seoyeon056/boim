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

// 기억해도 되는 값인지 판단한다.
//
// null·undefined 는 "못 받았다"는 뜻이라 기억하지 않는다. 그런데 고용 조회는
// null 대신 { status: "failed" } 같은 객체를 돌려주게 바뀌었고, 객체는 null 이
// 아니므로 실패가 5분 동안 캐시에 굳었다. 위의 "실패는 기억하지 않는다"가 그
// 순간부터 사실이 아니게 된 것이다.
//
// 증상: 국민연금이 한 번 대답하지 않으면 그 뒤 5분간 어느 화면에서 물어도
// 곧바로 "확인 불가"가 나온다. 다시 부르지 않으므로 응답이 0.1초 만에 오고,
// 사용자에게는 조회가 아주 빨리 끝난 것처럼 보인다.
function worthKeeping(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "object" && "status" in value) {
    return (value as { status: unknown }).status !== "failed";
  }
  return true;
}

/**
 * `load()` 의 결과를 `key` 로 기억한다. 조회에 실패한 결과는 기억하지 않는다
 * (null·undefined, 그리고 `status: "failed"`). 다음에 다시 물어봐야 한다.
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
      if (worthKeeping(value)) {
        sweep(now);
        store.set(key, { value, expiresAt: Date.now() + TTL_MS });
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
