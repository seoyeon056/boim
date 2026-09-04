import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 사용자 홈 디렉터리에도 package-lock.json 이 있어서 Next 가 작업 폴더를
  // 거기로 잡고 경고를 낸다("inferred your workspace root, but it may not be
  // correct"). 배포 시 어떤 파일을 함께 실어 보낼지 추적하는 기준이라 잘못
  // 잡히면 필요한 파일이 빠질 수 있다. 이 저장소를 기준으로 못박는다.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
