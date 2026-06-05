import { Progress, Space, Typography } from 'antd';

export interface BudgetIndicatorProps {
  iteration: number;
  maxIterations: number;
  tokensUsed: number;
  tokenBudget: number;
  elapsedMs: number;
  timeoutMs: number;
}

/** Ratio at/above which a bar turns yellow (warning). */
const WARNING_THRESHOLD = 0.6;
/** Ratio at/above which a bar turns red (danger). */
const DANGER_THRESHOLD = 0.85;

const COLOR_GREEN = '#52c41a';
const COLOR_YELLOW = '#faad14';
const COLOR_RED = '#ff4d4f';

/**
 * Clamp a used/limit pair to a ratio in the [0, 1] range. Guards against a
 * zero or negative limit so the component never divides by zero or emits NaN.
 */
function computeRatio(used: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }
  const ratio = used / limit;
  if (ratio < 0) {
    return 0;
  }
  if (ratio > 1) {
    return 1;
  }
  return ratio;
}

/**
 * Map a usage ratio to the bar color using the shared thresholds:
 * green `<60%` → yellow `<85%` → red `>=85%`.
 */
function ratioToColor(ratio: number): string {
  if (ratio >= DANGER_THRESHOLD) {
    return COLOR_RED;
  }
  if (ratio >= WARNING_THRESHOLD) {
    return COLOR_YELLOW;
  }
  return COLOR_GREEN;
}

interface BudgetBarProps {
  label: string;
  used: number;
  limit: number;
}

function BudgetBar({ label, used, limit }: BudgetBarProps) {
  const ratio = computeRatio(used, limit);
  const percent = Math.round(ratio * 100);

  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}: {used} / {limit}
      </Typography.Text>
      <Progress percent={percent} strokeColor={ratioToColor(ratio)} size="small" />
    </div>
  );
}

/**
 * Renders three Ant Design Progress bars (iterations, tokens, time) whose color
 * reflects how close each metric is to its configured limit.
 */
export function BudgetIndicator({
  iteration,
  maxIterations,
  tokensUsed,
  tokenBudget,
  elapsedMs,
  timeoutMs,
}: BudgetIndicatorProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <BudgetBar label="Iterations" used={iteration} limit={maxIterations} />
      <BudgetBar label="Tokens" used={tokensUsed} limit={tokenBudget} />
      <BudgetBar label="Time (ms)" used={elapsedMs} limit={timeoutMs} />
    </Space>
  );
}
