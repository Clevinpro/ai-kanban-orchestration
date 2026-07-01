import { ApiOutlined } from '@ant-design/icons';
import { List, Tag, Typography } from 'antd';

const { Text } = Typography;

// View-only state of a tool call, derived from the `@libs/api` `AgentEvent`
// status: a `tool_call` is still `pending` until the matching `tool_result`
// arrives, at which point it becomes `done`. Kept local so `@libs/ui` stays
// backend-agnostic (props in, no fetching).
export type ToolCallState = 'pending' | 'done';

// A single tool invocation row.
export interface ToolCallItem {
  // Dynamic tool name (from the backend registry). Never hardcoded.
  tool: string;
  // Optional serialized tool input.
  input?: string;
  // Lifecycle state derived from tool_call (pending) vs tool_result (done).
  state: ToolCallState;
}

export interface ToolCallListProps {
  // Ordered list of tool calls; rendered one row per call.
  calls: ToolCallItem[];
}

// Map each state to a readable label and tag color.
const STATE_META: Record<ToolCallState, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'processing' },
  done: { label: 'Done', color: 'success' },
};

/**
 * Presentational, view-only list of the agent's tool calls.
 * Renders nothing when the list is empty.
 */
export function ToolCallList({ calls }: ToolCallListProps) {
  if (calls.length === 0) {
    return null;
  }

  return (
    <List
      bordered
      size="small"
      data-testid="tool-call-list"
      dataSource={calls}
      renderItem={(call, index) => {
        const meta = STATE_META[call.state];
        return (
          <List.Item
            data-testid={`tool-call-${index}`}
            actions={[
              <Tag key="state" color={meta.color}>
                {meta.label}
              </Tag>,
            ]}
          >
            <List.Item.Meta
              avatar={<ApiOutlined />}
              title={<Text strong>{call.tool}</Text>}
              description={call.input ? <Text type="secondary">{call.input}</Text> : undefined}
            />
          </List.Item>
        );
      }}
    />
  );
}
