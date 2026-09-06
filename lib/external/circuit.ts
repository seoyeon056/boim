// 연달아 대답하지 않는 곳은 잠시 부르지 않는다.
//
// 공개 API 가 통째로 죽어 있는 시간대가 있다. 실측(국민연금, 2026-09-06):
// TCP 연결은 0.02초에 붙는데 TLS 핸드셰이크가 15초 만에 실패했다. 요청을
// 보내지도 못하는 상태라 6초 상한으로 20번을 던져 20번 다 실패했다.
//
// 그런 시간대에도 우리는 기업마다 상한까지 기다렸다. 조회 결과를 기억하는
// 캐시는 기업별이라(lib/external/cache.ts) 다른 기업으로 넘어가면 또 기다린다.
// 화면 하나 뜨는 데 20초씩 걸리고, 그게 기업을 바꿀 때마다 되풀이됐다.
//
// 그래서 축 단위로 센다. 연달아 정해진 횟수만큼 실패하면 잠시 동안은 부르지
// 않고 곧바로 "확인 불가"로 넘긴다. 그동안 화면은 지체 없이 뜨고, 나머지 축은
// 평소대로 나온다.
//
// 열어 두는 시간을 짧게 잡는 이유는, 그쪽이 복구됐는데도 우리가 계속 안 부르는
// 일을 오래 두지 않기 위해서다. 시간이 지나면 다시 한 번 불러 보고, 그 한 번이
// 성공하면 곧바로 원래대로 돌아간다.

// 이만큼 연달아 실패하면 잠시 쉰다.
const TRIP_AFTER = 2;

// 쉬는 시간.
const OPEN_MS = 60 * 1000;

type State = { failures: number; openUntil: number };

const states = new Map<string, State>();

function stateOf(name: string): State {
  let state = states.get(name);
  if (!state) {
    state = { failures: 0, openUntil: 0 };
    states.set(name, state);
  }
  return state;
}

/** 지금 이 축을 부르지 않고 건너뛸지. */
export function isTripped(name: string): boolean {
  return stateOf(name).openUntil > Date.now();
}

/** 한 번 대답하지 않았다. */
export function recordFailure(name: string): void {
  const state = stateOf(name);
  state.failures += 1;
  if (state.failures >= TRIP_AFTER) {
    state.openUntil = Date.now() + OPEN_MS;
  }
}

/** 대답했다. 세던 것을 지운다. */
export function recordSuccess(name: string): void {
  states.set(name, { failures: 0, openUntil: 0 });
}

// 테스트에서 상태를 비운다.
export function clearCircuits(): void {
  states.clear();
}
