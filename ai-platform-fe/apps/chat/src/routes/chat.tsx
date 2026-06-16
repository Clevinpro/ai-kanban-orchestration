import {
  AgentSteps,
  BudgetIndicator,
  ChatInput,
  ChatMessageList,
  ConversationSidebar,
  ToolCallList,
  type AgentStepItem,
  type ToolCallItem,
} from '@libs/ui';
import { useActiveConversation, useConversations, useDeleteConversation } from '@libs/store';
import { Button, Collapse, Flex, InputNumber, Space, Spin, Typography } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useChat, type SendMessageLimits } from '../hooks/useChat';
import { useScrollToBottom } from '../hooks/useScrollToBottom';

const { Text } = Typography;

// Local, composer-only limit form values. Each field is optional: an unset
// (null) field is omitted from the request so a plain chat sends as today.
type LimitFormValues = {
  maxIterations: number | null;
  tokenBudget: number | null;
  timeoutMs: number | null;
};

const EMPTY_LIMITS: LimitFormValues = {
  maxIterations: null,
  tokenBudget: null,
  timeoutMs: null,
};

// Build the optional limits payload, including only fields the user actually set.
function toSendLimits(values: LimitFormValues): SendMessageLimits | undefined {
  const limits: SendMessageLimits = {};
  if (values.maxIterations != null) limits.maxIterations = values.maxIterations;
  if (values.tokenBudget != null) limits.tokenBudget = values.tokenBudget;
  if (values.timeoutMs != null) limits.timeoutMs = values.timeoutMs;
  return Object.keys(limits).length > 0 ? limits : undefined;
}

export function ChatPage() {
  const { activeId, selectConversation, clearActiveConversation } = useActiveConversation();
  const { data: conversations, isPending: conversationsLoading } = useConversations();
  const deleteConversation = useDeleteConversation();

  const { messages, streaming, loadingHistory, sendMessage, steps, toolCalls, budget, stop } =
    useChat(activeId, {
      onConversationId: selectConversation,
    });

  const [limits, setLimits] = useState<LimitFormValues>(EMPTY_LIMITS);

  const lastMessageRef = useScrollToBottom(messages);

  // Map accumulated agent events to the view-only timeline shape.
  const stepItems = useMemo<AgentStepItem[]>(
    () =>
      steps.map((event) => ({
        iteration: event.iteration,
        status: event.status,
        tool: event.tool,
        input: event.input,
      })),
    [steps],
  );

  // Map tracked tool calls to the view-only list shape (pending until result).
  const toolCallItems = useMemo<ToolCallItem[]>(
    () =>
      toolCalls.map((call) => ({
        tool: call.tool,
        input: call.status === 'tool_result' ? call.output : call.input,
        state: call.status === 'tool_result' ? 'done' : 'pending',
      })),
    [toolCalls],
  );

  const hasAgentActivity = stepItems.length > 0 || toolCallItems.length > 0 || budget != null;

  const handleNewChat = () => {
    clearActiveConversation();
  };

  const handleDeleteConversation = (id: string) => {
    if (activeId === id) {
      handleNewChat();
    }
    deleteConversation.mutate(id);
  };

  const handleSend = (message: string) => {
    void sendMessage(message, toSendLimits(limits));
  };

  const updateLimit = (key: keyof LimitFormValues) => (value: number | null) => {
    setLimits((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Flex vertical style={{ height: '100vh', overflow: 'hidden' }}>
      <Flex flex={1} style={{ minHeight: 0 }}>
        <ConversationSidebar
          conversations={conversations ?? []}
          isLoading={conversationsLoading}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
        />
        <Flex vertical flex={1} style={{ minHeight: 0, padding: 16 }}>
          <Flex vertical flex={1} style={{ minHeight: 0, overflow: 'auto' }}>
            <Spin spinning={loadingHistory}>
              <ChatMessageList messages={messages} isStreaming={streaming} />
            </Spin>
            {/* Agent tool-use panels: stay quiet for a plain answer (no events). */}
            {hasAgentActivity ? (
              <Space
                orientation="vertical"
                size="middle"
                style={{ width: '100%', marginTop: 16 }}
                data-testid="agent-panels"
              >
                {budget ? (
                  <BudgetIndicator
                    iteration={budget.iteration}
                    tokensUsed={budget.tokensUsed}
                    elapsedMs={budget.elapsedMs}
                    maxIterations={budget.maxIterations}
                    tokenBudget={budget.tokenBudget}
                    timeoutMs={budget.timeoutMs}
                  />
                ) : null}
                <AgentSteps steps={stepItems} />
                <ToolCallList calls={toolCallItems} />
              </Space>
            ) : null}
            <div ref={lastMessageRef} />
          </Flex>

          {/* Optional safeguard limits — collapsed by default; not a mode toggle. */}
          <Collapse
            ghost
            size="small"
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'limits',
                label: 'Limits (optional)',
                children: (
                  <Space size="large" wrap data-testid="limit-inputs">
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">Max iterations</Text>
                      <InputNumber
                        aria-label="Max iterations"
                        min={1}
                        placeholder="default"
                        value={limits.maxIterations}
                        onChange={updateLimit('maxIterations')}
                        disabled={streaming}
                      />
                    </Space>
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">Token budget</Text>
                      <InputNumber
                        aria-label="Token budget"
                        min={1}
                        placeholder="default"
                        value={limits.tokenBudget}
                        onChange={updateLimit('tokenBudget')}
                        disabled={streaming}
                      />
                    </Space>
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">Timeout (ms)</Text>
                      <InputNumber
                        aria-label="Timeout (ms)"
                        min={1}
                        placeholder="default"
                        value={limits.timeoutMs}
                        onChange={updateLimit('timeoutMs')}
                        disabled={streaming}
                      />
                    </Space>
                  </Space>
                ),
              },
            ]}
          />

          <Flex gap="small" align="flex-end">
            <div style={{ flex: 1, minWidth: 0 }}>
              <ChatInput onSend={handleSend} isLoading={streaming} />
            </div>
            {streaming ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => void stop()}
                aria-label="Stop"
                data-testid="stop-button"
              >
                Stop
              </Button>
            ) : null}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}
