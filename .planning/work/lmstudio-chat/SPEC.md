# SPEC: LM Studio Chat (LLM) Provider

**Epic:** `lmstudio-chat`
**Created:** 2026-06-05
**Status:** Ready for Planning
**Independent of:** `lmstudio-embeddings` (different subsystem — `AI_PROVIDER`, not `EMBEDDING_PROVIDER`; zero shared files)

---

## Goal

Add a third **chat/LLM** provider — **LM Studio** — behind the existing
`IAIProvider` interface and `AiProviderFactory`. LM Studio runs an
OpenAI-compatible server locally (default `http://localhost:1234/v1`) exposing
`POST /v1/chat/completions` with SSE streaming. This lets users serve a local
GPU-accelerated model (e.g. `qwen3.6-35b-a3b-ud-mlx` on Apple Silicon / MLX) for
chat — private, offline, no API key — as an alternative to cloud Claude or
CPU-bound Ollama.

Selected via `AI_PROVIDER=lmstudio`. No changes to the Kafka streaming pipeline,
`AiService`, conversation persistence, or RAG — the provider plugs into the
existing `provider.chat(messages): Observable<string>` contract.

---

## User Stories / Requirements

### US-01: Local OpenAI-Compatible Chat
> As a developer, I want to point the chat step at LM Studio's local server so I
> can run a large local model (qwen3.6-35b) with GPU/MLX acceleration, without an
> API key and without sending data to a cloud.

### US-02: Streaming Parity
> As a user, I want LM Studio responses to stream token-by-token through the same
> SSE/Kafka path as Claude and Ollama, so the chat UI behaves identically.

### US-03: Same Interface, No Pipeline Changes
> As a developer, I want LM Studio to drop in behind `AiProviderFactory` so
> `AiService`, the Kafka consumer, and conversation history need no changes.

### US-04: Role-Faithful Messages
> As a user, I want my full conversation history (system + user + assistant turns)
> sent with correct roles — LM Studio is OpenAI-compatible and supports them
> natively, unlike the Ollama provider which collapses everything to `user`.

---

## Acceptance Criteria

- [ ] AC-01: `LmStudioProvider` implements `IAIProvider` — `chat(message: AiChatMessage): Observable<string>` + `getActiveModel(): Promise<string>`
- [ ] AC-02: Provider reads `LMSTUDIO_CHAT_URL` (default `http://localhost:1234/v1`) and `LMSTUDIO_CHAT_MODEL` (no hardcoded default model name; resolved — see AC-05)
- [ ] AC-03: `chat()` POSTs to `<LMSTUDIO_CHAT_URL>/chat/completions` with `{ model, messages, stream: true }`, OpenAI body shape, **no** `Authorization` header
- [ ] AC-04: SSE stream parsed correctly — split on lines, strip `data: ` prefix, ignore `data: [DONE]`, `JSON.parse` the rest, emit `choices[0].delta.content` when present; partial-line buffering across chunks (same buffer technique as Ollama provider)
- [ ] AC-05: Model resolution: `LMSTUDIO_CHAT_MODEL` env if set; else query `GET <LMSTUDIO_CHAT_URL>/models` and pick the first loaded id; else throw a clear error ("no LM Studio model loaded / set LMSTUDIO_CHAT_MODEL")
- [ ] AC-06: `AiChatMessage` → OpenAI messages mapping preserves `system` / `user` / `assistant` roles natively (string → single user; `{system,user}` → two messages; `ChatMessage[]` → 1:1 role passthrough)
- [ ] AC-07: `AiProviderFactory` resolves `AI_PROVIDER=lmstudio` to the new provider; unknown values still throw the existing clear error
- [ ] AC-08: `LmStudioProvider` registered in `AiProvidersModule` providers + exports (direct class, mirroring `OllamaProvider` — no API key, so no conditional `useFactory`)
- [ ] AC-09: `AI_PROVIDER` shared enum (`ai.constants.ts`) extended with `LMSTUDIO = 'lmstudio'`; `IAIConfig.provider` union extended to include `'lmstudio'`
- [ ] AC-10: Stream errors (connection refused, HTTP 4xx/5xx, malformed SSE) surface as a clear `LM Studio chat HTTP <status> (<url>): <detail>` Error via `subscriber.error`; error-body Readable drained (not leaked), mirroring Ollama's `formatAxiosErrorBody`
- [ ] AC-11: Unsubscribe destroys the underlying HTTP stream (Observable teardown), matching Ollama
- [ ] AC-12: `.env.example` documents `AI_PROVIDER=lmstudio`, `LMSTUDIO_CHAT_URL`, `LMSTUDIO_CHAT_MODEL`
- [ ] AC-13: Chat request logged with provider name + resolved model (matches existing observability)
- [ ] AC-14: `nx test ai-service` (and shared lib) passes; new provider unit-tested with mocked SSE stream chunks (single-token, multi-chunk split mid-JSON-line, `[DONE]`, error path); factory dispatch test extended for `lmstudio`

---

## Technical Design

### Architecture (extends existing AI provider abstraction)

```
src/ai/providers/
├── ai-provider.interface.ts      (unchanged — re-exports IAIProvider from shared)
├── ai-provider.factory.ts        (+ lmstudio branch + injected provider)
├── claude.provider.ts            (unchanged)
├── ollama.provider.ts            (template — clone this; closest analog: local HTTP streaming)
└── lmstudio.provider.ts          (NEW)

libs/shared/src/lib/
├── constants/ai.constants.ts     (+ LMSTUDIO enum member)
└── types/ai.types.ts             (IAIConfig.provider union + 'lmstudio')
```

### Why clone Ollama, not Claude

`OllamaProvider` is the local-HTTP-streaming analog: axios + `responseType: 'stream'`,
Observable wrapper, line-buffered chunk parsing, stream-teardown on unsubscribe,
drained error bodies. LM Studio reuses **all** of that structure. Only two real
differences:

| Concern | Ollama provider | LM Studio provider |
|---------|-----------------|--------------------|
| Endpoint | `POST {url}/api/chat` | `POST {url}/chat/completions` (OpenAI) |
| Stream format | newline-delimited JSON: `{message:{content}, done}` | **SSE**: `data: {json}\n\n`, `data: [DONE]`; token in `choices[0].delta.content`, end via `finish_reason != null` |
| Message roles | collapsed to `user` only | **native** `system`/`user`/`assistant` passthrough |
| Model resolve | env → `/api/ps` → `/api/tags` → `llama3.2` | env `LMSTUDIO_CHAT_MODEL` → `/models` first id → throw |
| Default URL | `http://localhost:11434` | `http://localhost:1234/v1` |
| Auth | none | none |

### SSE parsing (the one new mechanic)

```typescript
// inside stream.on('data') buffer loop — replaces Ollama's parseLine
const parseSseLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return;
  const payload = trimmed.slice(5).trim();      // strip "data:"
  if (payload === '[DONE]') { subscriber.complete(); return; }
  const json = JSON.parse(payload);
  const content = json.choices?.[0]?.delta?.content;
  if (content) subscriber.next(content);
  // finish_reason !== null also signals end; [DONE] is the authoritative close
};
```

Buffer across `data` chunks on `\n` exactly like Ollama (`buffer += ...; lines = buffer.split('\n'); buffer = lines.pop()`), since one TCP chunk may split an SSE line mid-JSON.

### Message mapping (role-faithful)

```typescript
private static toOpenAiMessages(
  message: AiChatMessage,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  if (typeof message === 'string') return [{ role: 'user', content: message }];
  if (!Array.isArray(message))
    return [
      { role: 'system', content: message.system },
      { role: 'user', content: message.user },
    ];
  return message.map((m) => ({ role: m.role, content: m.content })); // 1:1 passthrough
}
```

### Model resolution

```typescript
async resolveModel(): Promise<string> {
  const fromEnv = this.configService.get<string>('LMSTUDIO_CHAT_MODEL')?.trim();
  if (fromEnv) return fromEnv;
  const { data } = await axios.get<{ data?: Array<{ id: string }> }>(`${this.baseUrl}/models`);
  const first = data.data?.[0]?.id;
  if (first) return first;
  throw new Error('No LM Studio model loaded — set LMSTUDIO_CHAT_MODEL or load a model in LM Studio');
}
```

### Factory branch (`ai-provider.factory.ts`)

```typescript
constructor(
  private readonly configService: ConfigService,
  private readonly claudeProvider: ClaudeProvider,
  private readonly ollamaProvider: OllamaProvider,
  private readonly lmStudioProvider: LmStudioProvider,   // ADD
  private readonly logger: LoggerService,
) { this.provider = configService.get<string>('AI_PROVIDER') ?? 'ollama'; }

getProvider(): IAIProvider {
  if (this.provider === 'claude') return this.claudeProvider;
  if (this.provider === 'ollama') return this.ollamaProvider;
  if (this.provider === 'lmstudio') return this.lmStudioProvider;   // ADD
  throw new Error(`Unsupported AI_PROVIDER: ${this.provider}`);
}
```

### Module wiring (`ai-providers.module.ts`)

```typescript
providers: [AiProviderFactory, ClaudeProvider, OllamaProvider, LmStudioProvider],
exports:   [AiProviderFactory, ClaudeProvider, OllamaProvider, LmStudioProvider],
```

Direct class registration (like Ollama) — LM Studio needs no API key, so no
conditional `useFactory`. Config is read at runtime in the constructor.

### Shared enum + type

```typescript
// libs/shared/src/lib/constants/ai.constants.ts
export enum AI_PROVIDER {
  CLAUDE = 'claude',
  OLLAMA = 'ollama',
  LMSTUDIO = 'lmstudio',   // ADD
}

// libs/shared/src/lib/types/ai.types.ts
export interface IAIConfig {
  provider: 'claude' | 'ollama' | 'lmstudio';   // ADD
  claudeApiKey?: string;
  ollamaUrl?: string;
  lmStudioUrl?: string;   // ADD (optional, for completeness)
}
```

### Env vars (.env.example additions)

```bash
# AI provider — 'claude' (cloud) | 'ollama' (local) | 'lmstudio' (local, OpenAI-compatible)
AI_PROVIDER=claude

# LM Studio chat provider — used when AI_PROVIDER=lmstudio. No API key required.
# URL is the OpenAI-compatible base (include /v1). Leave LMSTUDIO_CHAT_MODEL blank
# to auto-pick the first model loaded in LM Studio, or pin a specific id.
LMSTUDIO_CHAT_URL=http://localhost:1234/v1
LMSTUDIO_CHAT_MODEL=
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Extend shared: add `AI_PROVIDER.LMSTUDIO` enum member + `IAIConfig.provider` union `'lmstudio'` (+ optional `lmStudioUrl`) | be | 1 |
| 2 | Implement `LmStudioProvider` (clone Ollama): axios stream → SSE line parse (`data:` strip, `[DONE]`, `choices[0].delta.content`), role-faithful `toOpenAiMessages`, `resolveModel` (env → `/models` → throw), drained error bodies, stream teardown on unsubscribe | be | 5 |
| 3 | Wire into `AiProviderFactory` (inject + `lmstudio` branch) and `AiProvidersModule` (providers + exports) | be | 2 |
| 4 | `.env.example` updates (`AI_PROVIDER=lmstudio` option, `LMSTUDIO_CHAT_URL`, `LMSTUDIO_CHAT_MODEL`) | be | 1 |
| 5 | Unit tests: mocked SSE stream (single token, multi-chunk split mid-line, `[DONE]`, error/connection-refused), role mapping, model resolve (env + `/models` + throw); extend `ai-provider.factory.spec.ts` for `lmstudio` dispatch | be | 4 |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changes to `AiService`, Kafka pipeline, conversation persistence, RAG | Provider is transparent behind `IAIProvider.chat()` — nothing upstream changes |
| LM Studio embeddings | Separate epic (`lmstudio-embeddings`), separate env var, already specced |
| Reasoning-token / `<think>` block handling | qwen3 emits reasoning; for v1 pass `delta.content` through as-is (matches how Claude/Ollama output is streamed). Stripping/structuring `<think>` or `delta.reasoning_content` is a separate concern |
| Non-streaming (`stream: false`) mode | Pipeline is streaming-only; no caller needs a blocking call |
| Tool/function calling, JSON mode, multi-modal | Chat text streaming only for v1 |
| Per-request model/provider selection | Provider + model resolved per boot/request via env, same as Claude/Ollama |
| Auth / API-key support for secured LM Studio deployments | LM Studio local default is keyless; add later behind an optional header if needed |

---

## Constraints

- **SSE format, not newline-JSON** — LM Studio streams `data: {json}` lines terminated by `[DONE]`; the parser must strip the `data:` prefix and handle `[DONE]`. Do not copy Ollama's `chunk.done` logic verbatim.
- **Partial-line buffering required** — one TCP `data` event may contain a fraction of an SSE line; must buffer on `\n` and carry the remainder (same technique as Ollama).
- **No `Authorization` header** and no API key (asserted in tests).
- **LM Studio server must be running with a model loaded** before a chat request; absent server → sanitized connection error via `subscriber.error`, no stack/socket leak.
- **Model must be a chat/instruct model** — an embedding model loaded in LM Studio will fail `/chat/completions`; `resolveModel` picks the first `/models` id, so the user is responsible for loading a chat model (document in `.env.example`).
- **Stream teardown** — Observable unsubscribe must `destroy()` the HTTP stream to avoid socket leaks (inherited Ollama behavior).
- Shared-lib change (`ai.constants.ts`, `ai.types.ts`) is still `repo: be` — both under `ai-platform/`. Stays within path isolation.

---

## Success Criteria

1. `AI_PROVIDER=lmstudio` boots ai-service; `AiProviderFactory.getProvider()` returns `LmStudioProvider`; a chat request streams tokens end-to-end through Kafka to the FE, identical UX to Claude/Ollama.
2. `chat()` hits `<LMSTUDIO_CHAT_URL>/chat/completions` with `{ model, messages, stream: true }`, no auth header; full system/user/assistant history sent with correct roles.
3. Token streaming is smooth — SSE chunks parsed incrementally, including chunks that split an SSE line mid-JSON; `[DONE]` cleanly completes the Observable.
4. `AI_PROVIDER=claude` and `=ollama` behave exactly as before — no regression.
5. Connection/HTTP/parse errors surface as clear `LM Studio chat HTTP ...` messages without leaking sockets or stack internals.
6. `nx test ai-service` + shared lib tests pass; provider covered for single-token, multi-chunk-split, `[DONE]`, and error paths; factory test covers `lmstudio` dispatch.
7. No upstream code changed — only new provider file + factory + module + shared enum/type + `.env.example`.
