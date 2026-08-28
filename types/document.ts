// 문서 업로드 화면에서 사용하는 공통 타입 정의

// 각 문서 카테고리가 가질 수 있는 상태
// - empty: 아직 아무것도 선택하지 않음 (미선택)
// - uploaded: 파일을 선택함
// - missing: 사용자가 "해당 문서 없음"을 선택함
export type DocumentStatus = "empty" | "uploaded" | "missing";

// 화면에 표시할 문서 카테고리 정보(정적 데이터)
export interface DocumentCategory {
  id: string;
  name: string;
  purpose: string;
  // 성장 신호 계산에 실제로 쓰이는 문서인지. 나머지는 맥락을 보는 참고 자료라
  // 없어도 진단이 끝난다. 여섯 개를 한 줄로 늘어놓으면 어느 것이 중요한지
  // 알 수 없어서, 화면에서 두 묶음으로 나누기 위한 표시다.
  analyzed?: boolean;
  // 그중에서도 이것 하나만 있으면 진단이 된다.
  primary?: boolean;
}

// sessionStorage에 저장할 개별 파일의 메타데이터
// 실제 File 객체가 아니라 이름/크기/형식만 저장한다.
export interface StoredFileMeta {
  name: string;
  size: number;
  type: string;
}

// sessionStorage에 저장할 카테고리별 정보
export interface StoredCategory {
  categoryId: string;
  categoryName: string;
  status: DocumentStatus;
  fileNames: string[];
  files: StoredFileMeta[];
  fileCount: number;
  totalSize: number;
}

// sessionStorage에 저장할 전체 구조
export interface StoredUpload {
  categories: StoredCategory[];
  totalFileCount: number;
  totalUploadSize: number;
}
