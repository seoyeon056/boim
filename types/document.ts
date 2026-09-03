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
  // 성장 신호(매출·거래처) 계산에 실제로 쓰이는 거래 실적 문서인지.
  // 여기에 해당하는 문서가 최소 한 장은 있어야 분석을 시작할 수 있다.
  analyzed?: boolean;
  // 그중에서도 이것 하나만 있으면 진단이 된다.
  primary?: boolean;
  // 입금 확인 용도로만 쓰는 문서(입금내역). 매출·거래처 계산에는 합산하지 않고,
  // "제출한 거래가 실제로 입금됐는지"를 곁들여 보여주는 데만 쓴다.
  settlement?: boolean;
  // 아직 일어나지 않은 거래(발주서·견적서·계약서). 미래 수요 신호로만 싣는다.
  future?: boolean;
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
  // "샘플 문서 불러오기"로 채운 예시 데이터인지. 결과 화면·진단서에 표시한다.
  isSample?: boolean;
}
