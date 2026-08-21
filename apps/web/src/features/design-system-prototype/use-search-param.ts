// PROTOTYPE — no router installed yet in apps/web, and this hook only needs
// to exist for the lifetime of the design-system comparison. Reads/writes a
// single query-string key, shareable and reload-stable, without pulling in
// react-router just for a throwaway switcher.
import { useCallback, useEffect, useState } from "react";

function readParam(key: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

export function useSearchParam(key: string, fallback: string): [string, (next: string) => void] {
  const [value, setValue] = useState(() => readParam(key, fallback));

  useEffect(() => {
    const onPopState = () => setValue(readParam(key, fallback));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [key, fallback]);

  const set = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set(key, next);
      window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}
