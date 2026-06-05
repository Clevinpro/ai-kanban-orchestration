import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Empty, List, Tag, Typography } from 'antd';

import type { IToolCall as IAgentToolCall } from '../AgentSteps/AgentSteps';

/**
 * UI-facing view type for a single invoked tool call.
 *
 * Extends the local `IToolCall` mirror from `AgentSteps` with an optional
 * `resolved` marker so the list can render a check mark once the call has
 * completed. Defined here (not imported from `apps/*` or backend packages) to
 * keep `libs/ui` free of backend/app dependencies.
 */
export interface IToolCall extends IAgentToolCall {
  resolved?: boolean;
}

export interface ToolCallListProps {
  toolCalls: IToolCall[];
}

function formatParams(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) {
    return <Empty description="No tool calls yet" />;
  }

  return (
    <List
      size="small"
      dataSource={toolCalls}
      renderItem={(call, index) => (
        <List.Item key={index}>
          <List.Item.Meta
            avatar={
              call.resolved ? (
                <CheckCircleOutlined
                  style={{ color: 'var(--ant-color-success, #52c41a)' }}
                  aria-label="resolved"
                />
              ) : (
                <LoadingOutlined spin aria-label="pending" />
              )
            }
            title={<Typography.Text strong>{call.tool}</Typography.Text>}
            description={
              <Typography.Text type="secondary" code style={{ fontSize: 12 }}>
                {formatParams(call.input)}
              </Typography.Text>
            }
          />
          {call.resolved ? (
            <Tag color="success">resolved</Tag>
          ) : (
            <Tag color="processing">pending</Tag>
          )}
        </List.Item>
      )}
    />
  );
}
