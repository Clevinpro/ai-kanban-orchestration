import {
  ApiOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { Timeline, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Text } = Typography;

// View-only agent step status. Shape is aligned with the `@libs/api` `AgentEvent`
// type, but kept local so `@libs/ui` stays backend-agnostic (props in, no fetching).
export type AgentStepStatus = 'planning' | 'tool_call' | 'tool_result' | 'final';

// A single reason->act step in the agent timeline.
export interface AgentStepItem {
  iteration: number;
  status: AgentStepStatus;
  // Dynamic tool name (only present for tool_call / tool_result). Never hardcoded.
  tool?: string;
  input?: string;
}

export interface AgentStepsProps {
  // Ordered list of steps; rendered top-to-bottom as a vertical timeline.
  steps: AgentStepItem[];
}

interface StatusMeta {
  label: string;
  color: string;
  icon: ReactNode;
}

// Map each status to a readable label, timeline dot color, and icon.
const STATUS_META: Record<AgentStepStatus, StatusMeta> = {
  planning: { label: 'Planning', color: 'blue', icon: <BulbOutlined /> },
  tool_call: { label: 'Tool call', color: 'orange', icon: <ApiOutlined /> },
  tool_result: { label: 'Tool result', color: 'cyan', icon: <FileSearchOutlined /> },
  final: { label: 'Final answer', color: 'green', icon: <CheckCircleOutlined /> },
};

/** Build the human-readable label for a step, appending the dynamic tool name when present. */
export function stepLabel(step: AgentStepItem): string {
  const base = STATUS_META[step.status].label;
  if (step.tool && (step.status === 'tool_call' || step.status === 'tool_result')) {
    return `${base}: ${step.tool}`;
  }
  return base;
}

/**
 * Presentational, view-only timeline of an agent's reason->act steps.
 * Renders nothing when the step list is empty.
 */
export function AgentSteps({ steps }: AgentStepsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <Timeline
      data-testid="agent-steps"
      items={steps.map((step, index) => {
        const meta = STATUS_META[step.status];
        return {
          key: `${step.iteration}-${step.status}-${index}`,
          color: meta.color,
          icon: meta.icon,
          content: (
            <div data-testid={`agent-step-${index}`}>
              <Text strong>{stepLabel(step)}</Text>
              <Text type="secondary" style={{ marginInlineStart: 8 }}>
                #{step.iteration}
              </Text>
              {step.input ? (
                <div>
                  <Text type="secondary">{step.input}</Text>
                </div>
              ) : null}
            </div>
          ),
        };
      })}
    />
  );
}
