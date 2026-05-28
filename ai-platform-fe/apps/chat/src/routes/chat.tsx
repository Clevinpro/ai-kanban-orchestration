import { ConversationSidebar, ChatInput, ChatMessageList } from '@libs/ui';
import { useChat } from '../hooks/useChat';
import { useScrollToBottom } from '../hooks/useScrollToBottom';
import { useActiveConversation, useConversations, useDeleteConversation } from '@libs/store';
import { Flex, Spin } from 'antd';

export function ChatPage() {
  const { activeId, selectConversation, clearActiveConversation } = useActiveConversation();
  const { data: conversations, isPending: conversationsLoading } = useConversations();
  const deleteConversation = useDeleteConversation();

  const { messages, streaming, loadingHistory, sendMessage } = useChat(activeId, {
    onConversationId: selectConversation,
  });

  const lastMessageRef = useScrollToBottom(messages);

  const handleNewChat = () => {
    clearActiveConversation();
  };

  const handleDeleteConversation = (id: string) => {
    if (activeId === id) {
      handleNewChat();
    }
    deleteConversation.mutate(id);
  };

  return (
    <Flex vertical style={{ height: '100vh', overflow: 'hidden' }}>
      <Flex flex={1} style={{ minHeight: 0 }}>
        <ConversationSidebar
          conversations={conversations ?? []}
          isLoading={conversationsLoading}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
        />
        <Flex vertical flex={1} style={{ minHeight: 0, padding: 16 }}>
          <Flex vertical flex={1} style={{ minHeight: 0, overflow: 'auto' }}>
            <Spin spinning={loadingHistory}>
              <ChatMessageList messages={messages} isStreaming={streaming} />
            </Spin>
            <div ref={lastMessageRef} />
          </Flex>
          <ChatInput onSend={sendMessage} isLoading={streaming} />
        </Flex>
      </Flex>
    </Flex>
  );
}
