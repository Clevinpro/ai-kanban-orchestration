import { Flex, Typography } from 'antd';
import { useTypewriter } from '../../hooks/useTypewriter';

const { Paragraph } = Typography;

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  status?: string;
  responseSeconds?: number;
}

function formatMessageTime(createdAt?: string) {
  if (!createdAt) {
    return null;
  }

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getResponseDurationColor(seconds: number) {
  if (seconds <= 20) {
    return '#389e0d';
  }

  if (seconds <= 40) {
    return '#d4b106';
  }

  if (seconds <= 60) {
    return '#d46b08';
  }

  return '#cf1322';
}

function formatResponseDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function MessageTime({ time, responseSeconds }: { time: string; responseSeconds?: number }) {
  if (!time) return <></>;

  return (
    <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
      {time}
      {typeof responseSeconds === 'number' ? (
        <Typography.Text
          style={{
            color: getResponseDurationColor(responseSeconds),
            fontSize: 11,
            marginLeft: 4,
            whiteSpace: 'nowrap',
          }}
        >
          ({formatResponseDuration(responseSeconds)})
        </Typography.Text>
      ) : null}
    </Typography.Text>
  );
}

export function ChatMessage({
  role,
  content,
  createdAt,
  status,
  responseSeconds,
}: ChatMessageProps) {
  const messageTime = formatMessageTime(createdAt);
  const isThinking = role === 'assistant' && content.trim().length === 0;
  const rawThinkingText = status ?? 'Model is thinking...';
  const thinkingText = useTypewriter(rawThinkingText);

  if (role === 'system') {
    return (
      <Flex justify="center" align="center" gap={8} style={{ marginBottom: 8 }}>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, maxWidth: '90%', textAlign: 'center' }}
        >
          {content}
        </Typography.Text>
        {messageTime ? <MessageTime time={messageTime} /> : null}
      </Flex>
    );
  }

  const isUser = role === 'user';

  return (
    <Flex
      justify={isUser ? 'flex-end' : 'flex-start'}
      align="flex-end"
      gap={8}
      style={{ marginBottom: 12 }}
    >
      {isUser && messageTime ? <MessageTime time={messageTime} /> : null}
      <div
        style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: 16,
          background: isUser ? '#1677ff' : '#f5f5f5',
          color: isUser ? '#ffffff' : 'rgba(0, 0, 0, 0.88)',
        }}
      >
        {isThinking ? (
          <Typography.Text type="secondary" italic>
            {thinkingText}
          </Typography.Text>
        ) : (
          <Paragraph style={{ marginBottom: 0, color: 'inherit', whiteSpace: 'pre-wrap' }}>
            {content}
          </Paragraph>
        )}
      </div>
      {!isUser && messageTime ? (
        <MessageTime time={messageTime} responseSeconds={responseSeconds} />
      ) : null}
    </Flex>
  );
}
