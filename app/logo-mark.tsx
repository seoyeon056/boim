// BO:IM 아이콘 마크. Figma 로고 익스포트(Create Logo)의 48px 락업을 헤더 크기로
// 옮긴 것이다.
//
// 원본은 글자에 'Outfit' 800 을 쓰는데 이 저장소는 그 폰트를 불러오지 않는다.
// 22px 짜리 타일 안의 글자 한 자를 위해 폰트를 하나 더 받는 것은 값이 맞지
// 않아, 본문 폰트(Pretendard)의 굵은 B 로 그린다.
//
// 그라디언트·필터 id 는 문서 전체에서 유일해야 한다. 이 마크는 헤더에 한 번만
// 놓이지만, 나중에 두 곳에 놓이면 id 가 겹쳐 뒤엣것이 앞엣것의 정의를 쓴다.
// 그래서 id 를 접두사로 받는다.
export default function LogoMark({
  size = 22,
  idPrefix = "boim-mark",
}: {
  size?: number;
  idPrefix?: string;
}) {
  const tile = `${idPrefix}-tile`;
  const letter = `${idPrefix}-letter`;
  const clip = `${idPrefix}-clip`;

  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      aria-hidden
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={tile} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2E2419" />
          <stop offset="100%" stopColor="#0E0A06" />
        </linearGradient>
        <linearGradient id={letter} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#BDB5A9" />
        </linearGradient>
        <clipPath id={clip}>
          <rect width="48" height="48" rx="10" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect width="48" height="48" rx="10" fill={`url(#${tile})`} />
        {/* 좌상단으로 빛이 도는 것처럼 보이게 하는 옅은 번짐 */}
        <ellipse cx="12" cy="6" rx="20" ry="10" fill="rgba(255,240,210,0.09)" />
        {/* 안쪽 테두리 — 타일이 조금 솟은 것처럼 보인다 */}
        <rect
          x="0.5"
          y="0.5"
          width="47"
          height="47"
          rx="9.5"
          fill="none"
          stroke="rgba(255,245,230,0.16)"
          strokeWidth="1"
        />
        {/* 가운데 주사선 — 로고의 ':' 와 같은 뜻(읽어 들이는 중)을 갖는다 */}
        <line
          x1="4"
          y1="24"
          x2="44"
          y2="24"
          stroke="#9B9189"
          strokeWidth="1"
          opacity="0.45"
        />
        <text
          x="23.5"
          y="36"
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontWeight="800"
          fontSize="34"
          fill={`url(#${letter})`}
        >
          B
        </text>
      </g>
    </svg>
  );
}
