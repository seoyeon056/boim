# Figma UI 익스포트 반영 가이드

Figma Make 익스포트(zip)를 이 저장소에 반영할 때 읽는 문서다.
지금까지 네 번 반영하면서 반복해서 걸린 것들을 적어둔다.

---

## 1. 이 프로젝트의 두 겹

```
UI       app/**/*.tsx          ← 익스포트가 바꾸는 곳
배선     lib/**, data/**       ← 익스포트에 없는 곳. 절대 덮어쓰지 않는다
```

**익스포트는 UI만 가져온다.** 익스포트 안의 `lib/`·`data/`는 Figma Make 안에서
화면을 돌려보기 위한 **가짜 배선**이다. 실제 값은 이 저장소 쪽에만 있다.

익스포트를 그대로 복사하면 아래가 전부 사라진다. 매번 확인할 것:

| 잃는 것 | 증상 |
|---|---|
| `?company=` URL 전달 (`lib/company-link.ts`) | 어느 기업을 골라도 첫 기업만 나온다 |
| 기업별 거래 데이터 (`data/transactions.ts`) | 모든 기업의 성장 신호가 똑같아진다 |
| `lib/diagnosis.ts` | 진단 문장이 고정 문구로 돌아간다 |
| `lib/external/*` | 뉴스·특허·채용·공시가 합성값으로 돌아간다 |
| `lib/llm/*` | LLM 해석이 사라진다 |
| `lib/ocr/*` | 업로드 문서 인식이 사라진다 |
| `app/api/*` | 라우트가 통째로 삭제된다 |

### 하드코딩된 값은 반드시 계산 결과에 연결한다

익스포트에는 해석 문구, `긍정`/`주의` 배지, 진단 문장, 등급이 **전부 문자열로**
박혀 있다. 그대로 두면 집중도 19.7%인 기업도 "주의"로 표시된다.

```tsx
// 익스포트                          // 이 저장소
status: "긍정",              →      status: statusLabel[result.statuses.customerGrowthRate],
note: "언론 노출 부족",       →      {metric.interpretation}
value: `+${rate}%`,          →      value: `${rate > 0 ? "+" : ""}${rate}%`,
```

---

## 2. zip 안에서 어느 폴더가 진짜인가

zip에 두 벌이 들어 있을 수 있다.

```
src/pages/*.tsx        ← 진짜. 이걸 본다
nextjs-export/app/*    ← 구버전. 무시한다
```

3차 반영 때 `nextjs-export/`를 기준으로 작업했다가 통째로 다시 했다.
당시 `Share`는 두 버전 유사도가 **29%**로 사실상 다른 화면이었다.

**대조 방법** — `CHANGES.md`가 없으면 이전 zip과 직접 비교한다.

```bash
diff <(sed 's/\r$//' 이전/pages__Signals.tsx) <(sed 's/\r$//' 이번/pages__Signals.tsx)
```

바뀐 파일만 추려서 그것만 반영한다. 매번 전체가 바뀌지는 않는다.

---

## 3. 서버 컴포넌트 경계

`page.tsx`가 서버 컴포넌트인 화면이 있다. 익스포트는 전부 클라이언트라
그대로 붙이면 안 된다.

| 화면 | page.tsx | 클라이언트로 뗀 조각 |
|---|---|---|
| `/visibility` | 서버 | `score-card.tsx` (카운트업) |
| `/signals` | 서버 | `metric-cards.tsx`, `signals-evidence.tsx`, `signals-view.tsx` |
| `/compare` | 서버 | `compare-view.tsx` |
| `/upload` `/processing` `/review` `/share` | 서버(껍데기) | `*-content.tsx` |

**규칙: 페이지 전체를 클라이언트로 바꾸지 말고, 훅이 필요한 부분만 떼어낸다.**

- 서버에서 하는 일: `searchParams` 읽기, 엔진 호출(`getVisibility`, `getSignals`)
- 클라이언트에서만 되는 일: `sessionStorage`, `useState`, 애니메이션, `window.print()`

```tsx
// page.tsx (서버)
export default async function Page(props: PageProps<"/signals">) {
  const companyId = readCompanyId((await props.searchParams).company);
  const result = await getSignals(companyId);
  return <MetricCards metrics={...} />;   // 움직이는 부분만 클라이언트
}
```

`searchParams`는 **Promise다**(Next 16). `await` 없이 쓰면 안 된다.

---

## 4. 반복해서 걸린 lint 규칙

### `react-hooks/set-state-in-effect`

effect 본문에서 곧바로 `setState`를 부르면 오류다. 익스포트 코드가 이 패턴을
자주 쓴다. 지금까지 세 번 걸렸다(자동완성, 근거 문서, 카운트업).

```tsx
// ❌ 익스포트가 주는 모양
useEffect(() => {
  if (query === "") { setResults([]); return; }
}, [query]);

// ✅ 렌더 시점에 파생값으로 계산
const visibleResults = hasQuery ? results : [];
```

패턴별 해법:

| 상황 | 해법 |
|---|---|
| 조건에 따라 화면을 비운다 | 상태를 지우지 말고 **파생값**으로 계산 |
| "로딩 중" 상태 | 결과가 어떤 입력의 것인지 기억하고 **현재 입력과 비교** |
| `sessionStorage` 읽기 | `useSyncExternalStore` (`signals-evidence.tsx` 참고) |
| 애니메이션 초기값 | `useState(target)`으로 시작 (`lib/use-count-up.ts` 참고) |

### 미사용 변수

배지를 인라인 스타일로 바꾸면 `toneStyles` 같은 상수가 남는다. 반드시 지운다.

---

## 5. 반영 순서

```bash
# 1. 최신화 먼저. 남의 작업 위에서 시작한다
git fetch origin --prune
git merge origin/main

# 2. 반영 후 검증 — 셋 다 통과해야 한다
npx tsc --noEmit
npm run lint          # 경고도 0이어야 한다
npx next build

# 3. 실제 렌더링 확인
npx next start -p 3000
curl -s "http://localhost:3000/visibility?company=hanbit" | grep -c "한빛정밀"
```

**빌드가 삭제된 라우트를 참조해 깨지면** `.next`를 지우고 다시 빌드한다.
생성된 타입 캐시가 남아서 그렇다.

```bash
rm -rf .next && npx next build
```

### 반영 후 확인할 것

- 기업을 바꾸면 값이 바뀌는가 (`?company=hanbit` vs `?company=harin-semicon`)
- 집중도가 낮은 기업에 "주의" 배지가 **안 뜨는가**
- 진단 문장이 기업마다 다른가

---

## 6. 환경변수

값이 없으면 합성 데이터로 돌아간다. 화면은 깨지지 않는다.

```
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET   뉴스 (네이버 클라우드 플랫폼)
SARAMIN_ACCESS_KEY                      채용공고
KIPRIS_SERVICE_KEY                      특허
DART_SEARCH_KEY                         공시 건수 + 실제 기업 검색
OPENAI_API_KEY                          LLM 해석
```

**`.env.local`은 git에 올라가지 않는다.** 배포본은 Vercel 대시보드
(Settings → Environment Variables)에 따로 등록하고 **Redeploy**해야 반영된다.

API 키에는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 브라우저 번들에 노출된다.

---

## 7. 익스포트를 따르지 않는 것

디자인이 아니라 기능·접근성이라 저장소 쪽을 유지한다.

- `aria-label`, `sr-only` 설명
- 업로드 이미지 미리보기
- 오타 (`추지한` → `추출한`, `제증되지` → `검증되지`, `바율` → `비율`)

익스포트에 오타가 섞여 오는 경우가 있다. 화면에 그대로 노출되므로 고친다.
