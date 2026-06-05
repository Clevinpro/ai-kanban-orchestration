import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * EventSource-backed state machine for an agent run.
 *
 * This hook owns the browser side of the agent SSE contract: it opens an
 * `EventSource` on `/ai/agent/stream`, parses each `MessageEvent.data` as a
 * JSON-encoded agent event, and dispatches by `event.type` into React state.
 *
 * It deliberately imports nothing from `libs/` (per SPEC AC-26). The local
 * view types below mirror the backend event payloads and the `@libs/ui`
 * view types (`IAgentStep`, `IToolCall`, budget/config fields) by field name,
 * so wiring this state into the shared UI components is a trivial pass-through.
 */

/** Default API base; mirrors `@libs/api` client without importing it. */
const DEFAULT_API_BASE = 'http://localhost:4000/api';

/** Path the browser hits for the agent stream (gateway proxy or direct). */
const AGENT_STREAM_PATH = '/ai/agent/stream';

/**
 * Agent event type string literals. These MUST match the backend
 * `AgentEventType` string-enum values exactly so the JSON `type` field
 * round-trips across the SSE boundary without a mapping table.
 */
const AGENT_EVENT_TYPE = {
  AGENT_START: 'AGENT_START',
  STEP: 'STEP',
  TOOL_CALL: 'TOOL_CALL',
  TOOL_RESULT: 'TOOL_RESULT',
  BUDGET: 'BUDGET',
  TOKEN: 'TOKEN',
  AGENT_DONE: 'AGENT_DONE',
  AGENT_ERROR: 'AGENT_ERROR',
} as const;

export type AgentStatus = 'idle' | 'running' | 'done' | 'error';

/** UI-facing view model for a single agent reasoning step. */
export interface IAgentStep {
  iteration: number;
  status: string;
  label?: string;
}

/** Local mirror of the backend tool-call payload, plus a resolved marker. */
export interface IToolCall {
  tool: string;
  input: Record<string, unknown>;
  resolved?: boolean;
}

/** Resolved run configuration carried by the `AGENT_START` event. */
export interface IAgentConfig {
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

/** Current budget consumption carried by `BUDGET` events. */
export interface IBudgetState {
  iteration: number;
  tokensUsed: number;
  elapsedMs: number;
}

/** Merged budget view combining live `IBudgetState` with run limits. */
export interface IAgentBudget extends IBudgetState {
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

/** A single decoded agent event off the wire. */
interface IAgentEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface UseAgentResult {
  steps: IAgentStep[];
  toolCalls: IToolCall[];
  budget: IAgentBudget | null;
  status: AgentStatus;
  finalResponse: string;
  runAgent: (task: string) => void;
}

/** Resolve the API base URL the same way `@libs/api` does, without importing it. */
function getApiBaseURL(): string {
  const meta = (
    import.meta as ImportMeta & {
      env?: { API_URL?: string };
    }
  ).env;

  return meta?.API_URL ?? DEFAULT_API_BASE;
}

function buildAgentStreamURL(task: string): string {
  const base = getApiBaseURL().replace(/\/$/, '');
  const url = new URL(`${base}${AGENT_STREAM_PATH}`);
  url.searchParams.set('task', task);
  return url.toString();
}

function parseEvent(event: MessageEvent<string>): IAgentEvent | null {
  try {
    const parsed = JSON.parse(event.data) as Partial<IAgentEvent>;
    if (typeof parsed?.type !== 'string') {
      return null;
    }
    return {
      type: parsed.type,
      data: parsed.data,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
    };
  } catch {
    return null;
  }
}

export function useAgent(): UseAgentResult {
  const [steps, setSteps] = useState<IAgentStep[]>([]);
  const [toolCalls, setToolCalls] = useState<IToolCall[]>([]);
  const [budget, setBudget] = useState<IAgentBudget | null>(null);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [finalResponse, setFinalResponse] = useState('');

  const esRef = useRef<EventSource | null>(null);
  // Holds the run config from AGENT_START so BUDGET events can be merged with
  // the run limits into a single `IAgentBudget` view for `<BudgetIndicator />`.
  const configRef = useRef<IAgentConfig | null>(null);

  const closeConnection = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (agentEvent: IAgentEvent) => {
      switch (agentEvent.type) {
        case AGENT_EVENT_TYPE.AGENT_START: {
          const config = agentEvent.data as Partial<IAgentConfig> | null;
          configRef.current = {
            maxIterations: Number(config?.maxIterations ?? 0),
            tokenBudget: Number(config?.tokenBudget ?? 0),
            timeoutMs: Number(config?.timeoutMs ?? 0),
          };
          setStatus('running');
          break;
        }

        case AGENT_EVENT_TYPE.STEP: {
          const step = agentEvent.data as Partial<IAgentStep> | null;
          setSteps((prev) => [
            ...prev,
            {
              iteration: Number(step?.iteration ?? prev.length + 1),
              status: typeof step?.status === 'string' ? step.status : 'running',
              label: typeof step?.label === 'string' ? step.label : undefined,
            },
          ]);
          break;
        }

        case AGENT_EVENT_TYPE.TOOL_CALL: {
          const call = agentEvent.data as Partial<IToolCall> | null;
          setToolCalls((prev) => [
            ...prev,
            {
              tool: typeof call?.tool === 'string' ? call.tool : 'unknown',
              input:
                call?.input && typeof call.input === 'object'
                  ? (call.input as Record<string, unknown>)
                  : {},
              resolved: false,
            },
          ]);
          break;
        }

        case AGENT_EVENT_TYPE.TOOL_RESULT: {
          // Mark the most recent unresolved tool call as resolved.
          setToolCalls((prev) => {
            if (prev.length === 0) {
              return prev;
            }
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], resolved: true };
            return next;
          });
          break;
        }

        case AGENT_EVENT_TYPE.BUDGET: {
          const state = agentEvent.data as Partial<IBudgetState> | null;
          const config = configRef.current;
          setBudget({
            iteration: Number(state?.iteration ?? 0),
            tokensUsed: Number(state?.tokensUsed ?? 0),
            elapsedMs: Number(state?.elapsedMs ?? 0),
            maxIterations: config?.maxIterations ?? 0,
            tokenBudget: config?.tokenBudget ?? 0,
            timeoutMs: config?.timeoutMs ?? 0,
          });
          break;
        }

        case AGENT_EVENT_TYPE.TOKEN: {
          const token = typeof agentEvent.data === 'string' ? agentEvent.data : '';
          if (token) {
            setFinalResponse((prev) => prev + token);
          }
          break;
        }

        case AGENT_EVENT_TYPE.AGENT_DONE: {
          setStatus('done');
          closeConnection();
          break;
        }

        case AGENT_EVENT_TYPE.AGENT_ERROR: {
          setStatus('error');
          closeConnection();
          break;
        }

        default:
          break;
      }
    },
    [closeConnection],
  );

  const runAgent = useCallback(
    (task: string) => {
      // Tear down any in-flight run before starting a new one.
      closeConnection();
      configRef.current = null;
      setSteps([]);
      setToolCalls([]);
      setBudget(null);
      setFinalResponse('');
      setStatus('running');

      const es = new EventSource(buildAgentStreamURL(task), { withCredentials: true });
      esRef.current = es;

      es.onmessage = (event: MessageEvent<string>) => {
        const agentEvent = parseEvent(event);
        if (agentEvent) {
          handleEvent(agentEvent);
        }
      };

      es.onerror = () => {
        // Surface a transport failure as a terminal error and stop the stream.
        setStatus('error');
        closeConnection();
      };
    },
    [closeConnection, handleEvent],
  );

  // Close the connection on unmount so no EventSource is leaked.
  useEffect(() => closeConnection, [closeConnection]);

  return { steps, toolCalls, budget, status, finalResponse, runAgent };
}
