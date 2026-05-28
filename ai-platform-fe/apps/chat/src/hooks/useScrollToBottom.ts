import { useEffect, useRef } from 'react';

export function useScrollToBottom(messages: unknown[]) {
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return lastMessageRef;
}
