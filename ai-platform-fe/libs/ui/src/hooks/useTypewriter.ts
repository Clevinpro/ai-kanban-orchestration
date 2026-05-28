import { useEffect, useRef, useState } from 'react';

interface UseTypewriterOptions {
  speed?: number;
}

export function useTypewriter(text: string, { speed = 30 }: UseTypewriterOptions = {}) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    indexRef.current = 0;

    intervalRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length && intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed]);

  return displayed;
}
