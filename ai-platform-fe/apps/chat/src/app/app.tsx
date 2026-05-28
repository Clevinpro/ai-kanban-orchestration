import { sendMessage, streamMessage } from '@libs/api';
import type { IChatStreamEvent } from '@libs/api';
import { ChatMessage } from '@libs/ui';
import { Button, Flex, Input, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  status?: string;
  responseSeconds?: number;
}

function getElapsedSeconds(startedAt?: string) {
  if (!startedAt) {
    return undefined;
  }

  const startedAtTimestamp = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtTimestamp)) {
    return undefined;
  }

  return Math.max(0, Math.round((Date.now() - startedAtTimestamp) / 1000));
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timerId = window.setInterval(() => {
      setMessages((prev) =>
        prev.map((message, index) =>
          index === prev.length - 1 && message.role === 'assistant'
            ? { ...message, responseSeconds: getElapsedSeconds(message.createdAt) }
            : message,
        ),
      );
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const createdAt = new Date().toISOString();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, createdAt },
      {
        role: 'assistant',
        content: '',
        createdAt,
        status: 'Waiting for response...',
        responseSeconds: 0,
      },
    ]);
    setLoading(true);

    eventSourceRef.current?.close();

    try {
      const { conversationId: newConversationId } = await sendMessage({
        message: text,
        conversationId,
      });

      const cid = newConversationId ?? conversationId;
      if (newConversationId) setConversationId(newConversationId);

      const es = streamMessage(cid);
      eventSourceRef.current = es;

      es.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as IChatStreamEvent;

          if (data.event === 'status' && data.message) {
            setMessages((prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 &&
                message.role === 'assistant' &&
                message.content.trim().length === 0
                  ? { ...message, status: data.message }
                  : message,
              ),
            );
            return;
          }

          if (data.event === 'complete') {
            setMessages((prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 && message.role === 'assistant'
                  ? { ...message, responseSeconds: getElapsedSeconds(message.createdAt) }
                  : message,
              ),
            );
            setLoading(false);
            es.close();
            eventSourceRef.current = null;
            return;
          }

          if (data.event === 'error') {
            throw new Error(data.error ?? 'Could not receive AI response.');
          }

          const chunk = data.result ?? '';
          if (chunk) {
            setMessages((prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 && message.role === 'assistant'
                  ? {
                      ...message,
                      content: `${message.content}${chunk}`,
                      status: undefined,
                      responseSeconds: message.responseSeconds,
                    }
                  : message,
              ),
            );
          }

          if (!data.event) {
            setMessages((prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 && message.role === 'assistant'
                  ? { ...message, responseSeconds: getElapsedSeconds(message.createdAt) }
                  : message,
              ),
            );
            setLoading(false);
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          setLoading(false);
          es.close();
          eventSourceRef.current = null;
        }
      };

      es.onerror = () => {
        setLoading(false);
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      setLoading(false);
    }
  }

  return (
    <Flex vertical style={{ height: '100vh', padding: 24 }}>
      <Typography.Title level={4} style={{ margin: '0 0 16px' }}>
        AI Chat
      </Typography.Title>

      <Flex vertical flex={1} style={{ overflowY: 'auto', marginBottom: 16 }}>
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role}
            content={msg.content}
            createdAt={msg.createdAt}
            status={msg.status}
            responseSeconds={msg.responseSeconds}
          />
        ))}
        <div ref={bottomRef} />
      </Flex>

      <Flex gap="small">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={() => void handleSend()}
          placeholder="Type a message…"
          disabled={loading}
        />
        <Button type="primary" onClick={() => void handleSend()} loading={loading}>
          Send
        </Button>
      </Flex>
    </Flex>
  );
}

export default App;
