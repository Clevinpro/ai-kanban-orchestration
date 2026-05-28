import { Empty, Flex } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { ChatMessage } from '../ChatMessage/ChatMessage';

export interface IChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  status?: string;
  responseSeconds?: number;
}

export interface ChatMessageListProps {
  messages: IChatMessage[];
  isStreaming?: boolean;
}

function getElapsedSeconds(startedAt?: string, now = Date.now()) {
  if (!startedAt) {
    return undefined;
  }

  const startedAtTimestamp = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtTimestamp)) {
    return undefined;
  }

  return Math.max(0, Math.round((now - startedAtTimestamp) / 1000));
}

export function ChatMessageList({ messages, isStreaming = false }: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  const activeResponseIndex = isStreaming
    ? messages.reduce(
        (lastIndex, message, index) => (message.role === 'assistant' ? index : lastIndex),
        -1,
      )
    : -1;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (activeResponseIndex === -1) {
      return;
    }

    setNow(Date.now());
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [activeResponseIndex]);

  if (messages.length === 0) {
    return <Empty description="No messages yet" />;
  }

  const getResponseSeconds = (message: IChatMessage, index: number) => {
    if (message.role !== 'assistant') {
      return undefined;
    }

    if (index === activeResponseIndex) {
      return getElapsedSeconds(message.createdAt, now);
    }

    if (typeof message.responseSeconds === 'number') {
      return message.responseSeconds;
    }

    const userMessage = [...messages.slice(0, index)]
      .reverse()
      .find((previousMessage) => previousMessage.role === 'user' && previousMessage.createdAt);
    if (!message.createdAt || !userMessage?.createdAt) {
      return undefined;
    }

    const startedAt = new Date(userMessage.createdAt).getTime();
    const finishedAt = new Date(message.createdAt).getTime();
    if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt < startedAt) {
      return undefined;
    }

    return Math.round((finishedAt - startedAt) / 1000);
  };

  return (
    <Flex vertical style={{ overflowY: 'auto', padding: 16 }}>
      {messages.map((message, index) => (
        <ChatMessage
          key={message.id ?? `${message.role}-${index}`}
          role={message.role}
          content={message.content}
          createdAt={message.createdAt}
          status={message.status}
          responseSeconds={getResponseSeconds(message, index)}
        />
      ))}
      <div ref={endRef} />
    </Flex>
  );
}
