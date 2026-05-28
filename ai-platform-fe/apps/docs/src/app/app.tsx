import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Spin, Tag, Typography } from 'antd';
import { getDocumentNotes } from '@libs/api';
import { queryKeys } from '@libs/store';
import type { DocumentNote } from '@libs/api';

const { Title, Text, Paragraph } = Typography;

const SOURCE_BADGE_COLORS: Record<'Vault' | 'Manual', string> = {
  Vault: 'purple',
  Manual: 'default',
};

function getSourceLabel(filePath: string | null): 'Vault' | 'Manual' {
  return filePath?.includes('obsidian-vault') ? 'Vault' : 'Manual';
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DocumentCard({ doc }: { doc: DocumentNote }) {
  const source = getSourceLabel(doc.filePath);

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{doc.title}</span>
          <Tag color={SOURCE_BADGE_COLORS[source]}>{source}</Tag>
        </span>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDate(doc.createdAt)}
        </Text>
      }
    >
      {doc.aiNotes ? (
        <Paragraph style={{ margin: 0 }}>{doc.aiNotes}</Paragraph>
      ) : (
        <Text type="secondary" italic>
          No AI notes available.
        </Text>
      )}
    </Card>
  );
}

export function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.documents.notes,
    queryFn: getDocumentNotes,
  });

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Spin size="large" />
        <Text style={{ marginTop: 12 }}>Loading documents...</Text>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 32 }}>
        <Empty
          description={<Text type="danger">Failed to load documents. Please try again later.</Text>}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <Title level={2} style={{ marginBottom: 24 }}>
        Knowledge Base
      </Title>

      {data && data.length > 0 ? (
        data.map((doc) => <DocumentCard key={doc.id} doc={doc} />)
      ) : (
        <Empty description="No documents indexed yet." />
      )}
    </div>
  );
}

export default App;
