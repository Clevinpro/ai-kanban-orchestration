import type { IConversationList } from '@libs/api';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Flex, Skeleton, Typography } from 'antd';

import styles from './ConversationSidebar.module.css';

const { Text } = Typography;

export interface ConversationSidebarProps {
  conversations: IConversationList[];
  isLoading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatListDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationSidebar({
  conversations,
  isLoading,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <aside className={styles['sidebar']}>
      <Button type="primary" className={styles['new-chat-btn']} onClick={onNew}>
        + New Chat
      </Button>
      {isLoading ? (
        <Flex vertical gap={8} style={{ padding: '0 12px 12px' }}>
          <Skeleton active title={false} paragraph={{ rows: 6 }} />
        </Flex>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {conversations.map((c) => {
            const label =
              c.title?.trim() ||
              (c.preview?.trim() ? `New Chat — ${c.preview.trim()}` : 'New Chat');
            return (
              <li key={c.id}>
                <div
                  className={`${styles['conversation-item']} ${activeId === c.id ? styles['active-item'] : ''}`}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(c.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles['conversation-main']}>
                    <Text className={styles['conversation-title']} title={label}>
                      {label}
                    </Text>
                  </div>
                  <div className={styles['conversation-meta']}>
                    <span className={styles['conversation-date']}>
                      {formatListDate(c.updatedAt)}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      className={styles['delete-btn']}
                      aria-label="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
