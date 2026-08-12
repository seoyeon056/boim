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
