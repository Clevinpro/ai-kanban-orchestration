export const queryKeys = {
  auth: {
    user: ['auth', 'user'],
  },
  documents: {
    all: ['documents'],
    one: (id: string) => ['documents', id],
    notes: ['documents', 'notes'] as const,
  },
  chat: {
    history: (id: string) => ['chat', id],
  },
  conversations: {
    all: ['conversations'] as const,
    one: (id: string) => ['conversations', id] as const,
  },
};
