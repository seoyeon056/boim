# BOIM Engine

거래 데이터를 기반으로 기업의 성장 신호와 외부 가시성을 계산해주는 Next.js API 서버입니다.

## API

| Endpoint | 설명 |
| --- | --- |
| `GET /api/health` | 서버 상태 확인 |
| `GET /api/signals` | 고객 성장률, 재구매율, 상위 고객 집중도 등 성장 신호 계산 |
| `GET /api/visibility` | 뉴스/특허/채용 정보 기반 외부 가시성 점수 |

## 개발 환경 실행

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 확인할 수 있습니다.

## 배포

Vercel에 연동되어 `main` 브랜치에 푸시하면 자동 배포됩니다.
