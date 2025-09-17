"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

const FullLoadingContext = createContext((value: boolean) => value);

function FullLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#00000050] bg-opacity-50 z-50">
      <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
    </div>
  );
}

export function FullLoadingProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<boolean>(false);

  const onChangeLoading = useCallback((value: boolean) => {
    setLoading(value);
    return value;
  }, []);

  return (
    <FullLoadingContext.Provider value={onChangeLoading}>
      {loading && <FullLoading />}
      {children}
    </FullLoadingContext.Provider>
  );
}

export const useFullLoadingContext = () => useContext(FullLoadingContext);
