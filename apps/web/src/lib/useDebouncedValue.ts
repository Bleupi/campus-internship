import { useEffect, useState } from "react";

// Generic debounce for anything driving a query on keystroke (issue #113's
// organism search Autocomplete) — no domain knowledge, kept in lib/ rather
// than a feature folder since it's reusable across any future search box.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
