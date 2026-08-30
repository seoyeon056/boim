"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { documentCategories } from "@/data/documentCategories";
import type { DocumentStatus } from "@/types/document";

export interface CategoryState {
  status: DocumentStatus;
  files: File[];
}

type StatesMap = Record<string, CategoryState>;

function emptyStates(): StatesMap {
  return Object.fromEntries(
    documentCategories.map((category) => [
      category.id,
      { status: "empty" as DocumentStatus, files: [] as File[] },
    ]),
  );
}

const UploadStoreContext = createContext<{
  states: StatesMap;
  setStates: React.Dispatch<React.SetStateAction<StatesMap>>;
  // 처음 화면으로 돌아갈 때 업로드 상태를 통째로 비운다.
  reset: () => void;
} | null>(null);

export function UploadStoreProvider({ children }: { children: React.ReactNode }) {
  const [states, setStates] = useState<StatesMap>(emptyStates);
  const reset = useCallback(() => setStates(emptyStates()), []);

  return (
    <UploadStoreContext.Provider value={{ states, setStates, reset }}>
      {children}
    </UploadStoreContext.Provider>
  );
}

export function useUploadStore() {
  const ctx = useContext(UploadStoreContext);
  if (!ctx) throw new Error("useUploadStore must be used inside UploadStoreProvider");
  return ctx;
}
