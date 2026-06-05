import { AgentSteps, BudgetIndicator, ToolCallList, ChatInput, ChatMessage } from '@libs/ui';
import { Card, Col, Flex, Row } from 'antd';
import { useAgent } from '../hooks/useAgent';

/**
 * Agent run page.
 *
 * Wires the `useAgent` EventSource state machine to the shared `@libs/ui`
 * visualization components in the SPEC layout:
 *
 *   ┌──────────────┬─────────────┐
 *   │ AgentSteps   │ Budget       │
 *   │ (timeline)   │ Indicator    │
 *   │              │ ToolCallList │
 *   ├──────────────┴─────────────┤
 *   │ Final answer (streamed)     │
 *   ├─────────────────────────────┤
 *   │ ChatInput → runAgent(task)  │
 *   └─────────────────────────────┘
 *
 * Route registration lives in TASK-016 — this file only defines the page.
 */
export function AgentPage() {
  const { steps, toolCalls, budget, status, finalResponse, runAgent } = useAgent();

  const isRunning = status === 'running';

  return (
    <Flex vertical gap={16} style={{ height: '100vh', overflow: 'hidden', padding: 16 }}>
      {/* Split top row: timeline (left) and budget + tool calls (right). */}
      <Row gutter={16} style={{ flex: 1, minHeight: 0 }} wrap={false}>
        <Col span={16} style={{ minHeight: 0, display: 'flex' }}>
          <Card title="Steps" style={{ width: '100%', overflow: 'auto' }}>
            <AgentSteps steps={steps} />
          </Card>
        </Col>
        <Col span={8} style={{ minHeight: 0, display: 'flex' }}>
          <Flex vertical gap={16} style={{ width: '100%', minHeight: 0, overflow: 'auto' }}>
            <Card title="Budget">
              {budget ? (
                <BudgetIndicator
                  iteration={budget.iteration}
                  maxIterations={budget.maxIterations}
                  tokensUsed={budget.tokensUsed}
                  tokenBudget={budget.tokenBudget}
                  elapsedMs={budget.elapsedMs}
                  timeoutMs={budget.timeoutMs}
                />
              ) : (
                <BudgetIndicator
                  iteration={0}
                  maxIterations={0}
                  tokensUsed={0}
                  tokenBudget={0}
                  elapsedMs={0}
                  timeoutMs={0}
                />
              )}
            </Card>
            <Card title="Tool Calls">
              <ToolCallList toolCalls={toolCalls} />
            </Card>
          </Flex>
        </Col>
      </Row>

      {/* Streamed final answer. */}
      <Card title="Final Answer" style={{ flexShrink: 0 }}>
        <ChatMessage role="assistant" content={finalResponse} status="Agent is working..." />
      </Card>

      {/* Task input — submitting triggers a new agent run. */}
      <ChatInput onSend={runAgent} isLoading={isRunning} />
    </Flex>
  );
}
