// 사람인(Saramin) 채용정보 API.
// 워크넷 채용정보 API는 개인 회원에게 발급되지 않아 대신 사용한다.
// https://oapi.saramin.co.kr
export async function fetchJobCount(
  companyName: string,
): Promise<number | null> {
  const accessKey = process.env.SARAMIN_ACCESS_KEY;

  if (!accessKey) {
    return null;
  }

  const url = new URL("https://oapi.saramin.co.kr/job-search");
  url.searchParams.set("access-key", accessKey);
  url.searchParams.set("keywords", companyName);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      jobs?: { total?: number | string };
    };
    const total = data.jobs?.total;
    const count = typeof total === "string" ? Number(total) : total;

    return typeof count === "number" && Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}
