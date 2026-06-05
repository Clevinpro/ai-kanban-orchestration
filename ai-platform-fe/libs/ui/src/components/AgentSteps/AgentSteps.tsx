import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Empty, Timeline, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * UI-facing view type for a single agent reasoning step.
 *
 * Field names intentionally mirror the backend agent event payloads so the
 * `useAgent` mapping (TASK-014) is a trivial pass-through. Do NOT import from
 * `apps/*` or backend packages here — `libs/ui` owns this view type.
 */
export interface IAgentStep {
  iteration: number;
  status: string;
  label?: string;
}

/**
 * Local mirror of the backend tool-call payload. Defined here (not imported)
 * to keep `libs/ui` free of backend/app dependencies and avoid circular deps.
 */
export interface IToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface AgentStepsProps {
  steps: IAgentStep[];
}

const RUNNING_STATUSES = new Set(['running', 'in_progress', 'inprogress', 'active', 'pending']);
const SUCCESS_STATUSES = new Set(['completed', 'complete', 'done', 'success', 'succeeded']);
const ERROR_STATUSES = new Set(['error', 'failed', 'failure']);

type StepVisual = {
  icon: ReactNode;
  color: string;
};

function getStepVisual(status: string): StepVisual {
  const normalized = status.trim().toLowerCase();

  if (RUNNING_STATUSES.has(normalized)) {
    return { icon: <LoadingOutlined spin />, color: 'blue' };
  }

  if (SUCCESS_STATUSES.has(normalized)) {
    return { icon: <CheckCircleOutlined />, color: 'green' };
  }

  if (ERROR_STATUSES.has(normalized)) {
    return { icon: <CloseCircleOutlined />, color: 'red' };
  }

  if (normalized === 'waiting' || normalized === 'queued') {
    return { icon: <ClockCircleOutlined />, color: 'gray' };
  }

  return { icon: <ExclamationCircleOutlined />, color: 'gray' };
}

export function AgentSteps({ steps }: AgentStepsProps) {
  if (steps.length === 0) {
    return <Empty description="No agent steps yet" />;
  }

  const items = steps.map((step) => {
    const { icon, color } = getStepVisual(step.status);

    return {
      dot: icon,
      color,
      children: (
        <Typography.Text>
          {step.label ?? `Step ${step.iteration}`}
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {step.status}
          </Typography.Text>
        </Typography.Text>
      ),
    };
  });

  return <Timeline items={items} />;
}
