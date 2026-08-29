import type { StoredUpload } from "@/types/document";

// 업로드 내역은 sessionStorage에만 있다(문서를 서버로 보내지 않는 설계).
// Step 05의 근거 문서 목록과 진단서의 붙임 목록이 같은 기록을 읽어야 해서
// 여기 한 곳에 둔다. 두 화면이 각자 읽으면 한쪽만 고쳐지는 일이 생긴다.
const STORAGE_KEY = "boimDocumentUpload";

// useSyncExternalStore의 getSnapshot은 값이 같으면 같은 참조를 돌려줘야 한다.
// 매번 JSON.parse하면 참조가 달라져서 렌더가 멈추지 않는다.
let cachedRaw: string | null = null;
let cachedUpload: StoredUpload | null = null;

export function readUploadSnapshot(): StoredUpload | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUpload = raw ? (JSON.parse(raw) as StoredUpload) : null;
    } catch {
      cachedUpload = null;
    }
  }

  return cachedUpload;
}

// 서버 렌더 때는 기록이 없다고 본다. 브라우저에서 실제 값으로 다시 그린다.
export function serverUploadSnapshot(): StoredUpload | null {
  return null;
}

// 이 화면에 들어온 뒤로 업로드 기록이 바뀌지 않으므로 구독할 것이 없다.
export function subscribeUpload(): () => void {
  return () => {};
}

// 실제로 파일이 올라온 카테고리 이름. "해당 문서 없음"으로 표시한 것과
// 아직 손대지 않은 것은 근거가 아니므로 뺀다.
export function uploadedCategoryNames(upload: StoredUpload | null): string[] {
  return (upload?.categories ?? [])
    .filter((category) => category.status === "uploaded")
    .map((category) => category.categoryName);
}
