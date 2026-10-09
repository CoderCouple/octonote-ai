import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Refetches when the screen regains focus (e.g. switching back to its tab),
 * skipping the first focus since the query has just loaded. From the
 * TanStack Query React Native guide.
 */
export function useRefreshOnFocus(refetch: () => unknown) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}
