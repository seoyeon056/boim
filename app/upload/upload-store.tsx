"use client";

import { createContext, useContext, useState } from "react";
import { documentCategories } from "@/data/documentCategories";
import type { DocumentStatus } from "@/types/document";

export interface CategoryState {
  status: DocumentStatus;
  files: File[];
}

type StatesMap = Record<string, CategoryState>;

const UploadStoreContext = createContext<{
  states: StatesMap;
  setStates: React.Dispatch<React.SetStateAction<StatesMap>>;
} | null>(null);

export function UploadStoreProvider({ children }: { children: React.ReactNode }) {
  const [states, setStates] = useState<StatesMap>(() =>
    Object.fromEntries(
      documentCategories.map((category) => [
        category.id,
        { status: "empty" as DocumentStatus, files: [] as File[] },
      ]),
    ),
  );

  return (
    <UploadStoreContext.Provider value={{ states, setStates }}>
      {children}
    </UploadStoreContext.Provider>
  );
}

export function useUploadStore() {
  const ctx = useContext(UploadStoreContext);
  if (!ctx) throw new Error("useUploadStore must be used inside UploadStoreProvider");
  return ctx;
}
