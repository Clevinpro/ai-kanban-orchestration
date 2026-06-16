import { Progress, Space, Typography } from 'antd';

const { Text } = Typography;

// View-only budget snapshot. Shape is aligned with the `@libs/api` `AgentBudget`
// type, but kept local so `@libs/ui` stays backend-agnostic (props in, no fetching).
export interface BudgetIndicatorProps {
  iteration: number;
  tokensUsed: number;
  elapsedMs: number;
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

// Color thresholds: green below 70%, yellow 70-90%, red above 90%.
const GREEN = '#52c41a';
const YELLOW = '#faad14';
const RED = '#f5222d';

/** Clamp a used/limit ratio to a 0-100 percentage. */
export function fillPercent(used: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  const pct = (used / limit) * 100;
  if (pct < 0) {
    return 0;
  }
  return pct > 100 ? 100 : pct;
}

/** Map a fill percentage to its threshold color. */
export function thresholdColor(percent: number): string {
  if (percent > 90) {
    return RED;
  }
  if (percent >= 70) {
    return YELLOW;
  }
  return GREEN;
}

interface BudgetBarProps {
  label: string;
  used: number;
  limit: number;
  /** Optional formatter for the "used / limit" caption. */
  format?: (value: number) => string;
}

function BudgetBar({ label, used, limit, format }: BudgetBarProps) {
  const percent = fillPercent(used, limit);
  const color = thresholdColor(percent);
  const render = format ?? ((value: number) => String(value));

  return (
    <div data-testid={`budget-bar-${label.toLowerCase()}`} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary">{label}</Text>
        <Text type="secondary">
          {render(used)} / {render(limit)}
        </Text>
      </Space>
      <Progress
        percent={Math.round(percent)}
        strokeColor={color}
        showInfo={false}
        size="small"
        aria-label={`${label} budget usage`}
      />
    </div>
  );
}

/** Format milliseconds as a compact seconds string. */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Presentational indicator rendering three progress bars (iterations, tokens, time)
 * that shift green -> yellow -> red as usage approaches each limit.
 */
export function BudgetIndicator({
  iteration,
  tokensUsed,
  elapsedMs,
  maxIterations,
  tokenBudget,
  timeoutMs,
}: BudgetIndicatorProps) {
  return (
    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      <BudgetBar label="Iterations" used={iteration} limit={maxIterations} />
      <BudgetBar label="Tokens" used={tokensUsed} limit={tokenBudget} />
      <BudgetBar label="Time" used={elapsedMs} limit={timeoutMs} format={formatSeconds} />
    </Space>
  );
}
