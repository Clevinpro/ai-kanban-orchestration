import { DeleteOutlined, FileOutlined } from '@ant-design/icons';
import { Button, List, Typography } from 'antd';

const { Text } = Typography;

export interface DocumentListItem {
  id: string;
  name: string;
}

export interface DocumentListProps {
  documents: DocumentListItem[];
  /** Called when user removes a document from the list */
  onRemove?: (id: string) => void;
}

export function DocumentList({ documents, onRemove }: DocumentListProps) {
  // TODO: loading skeleton, empty state, upload entry, status tags
  return (
    <List
      bordered
      dataSource={documents}
      renderItem={(item) => (
        <List.Item
          actions={
            onRemove
              ? [
                  <Button
                    key="remove"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Remove ${item.name}`}
                    onClick={() => {
                      // TODO: confirm modal, API call
                      onRemove(item.id);
                    }}
                  />,
                ]
              : undefined
          }
        >
          <List.Item.Meta avatar={<FileOutlined />} title={<Text>{item.name}</Text>} />
        </List.Item>
      )}
    />
  );
}
