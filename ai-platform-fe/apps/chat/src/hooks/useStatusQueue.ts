import { useCallback, useEffect, useRef } from 'react';

const STATUS_DEBOUNCE_MS = 1500;

export function useStatusQueue() {
  const queueRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((onNext: (text: string) => void) => {
    const next = queueRef.current.shift();
    if (next === undefined) {
      timerRef.current = null;
      return;
    }
    onNext(next);
    timerRef.current = setTimeout(() => flush(onNext), STATUS_DEBOUNCE_MS);
  }, []);

  const enqueue = useCallback(
    (text: string, onNext: (text: string) => void) => {
      queueRef.current.push(text);
      if (timerRef.current === null) {
        flush(onNext);
      }
    },
    [flush],
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    queueRef.current = [];
  }, []);

  useEffect(() => cancel, [cancel]);

  return { enqueue, cancel };
}
