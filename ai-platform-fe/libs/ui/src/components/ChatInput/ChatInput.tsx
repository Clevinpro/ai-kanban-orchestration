import { SendOutlined } from '@ant-design/icons';
import { Button, Flex, Input } from 'antd';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

const { TextArea } = Input;

export interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const sendMessage = () => {
    const nextMessage = message.trim();

    if (!nextMessage || isLoading) {
      return;
    }

    onSend(nextMessage);
    setMessage('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    sendMessage();
  };

  return (
    <Flex gap="small" align="flex-end">
      <TextArea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        autoSize={{ minRows: 1, maxRows: 6 }}
        disabled={isLoading}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        loading={isLoading}
        disabled={!message.trim()}
        onClick={sendMessage}
      >
        Send
      </Button>
    </Flex>
  );
}
