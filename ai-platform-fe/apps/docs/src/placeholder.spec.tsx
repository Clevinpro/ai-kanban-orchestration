import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app/app';

const getDocumentNotesMock = vi.fn();

vi.mock('@libs/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@libs/api')>();
  return {
    ...actual,
    getDocumentNotes: () => getDocumentNotesMock(),
  };
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('docs App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    getDocumentNotesMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('mounts without crashing and renders the page heading', async () => {
    getDocumentNotesMock.mockResolvedValue([]);

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Knowledge Base' })).toBeInTheDocument();
  });

  it('renders a document card when data is returned', async () => {
    getDocumentNotesMock.mockResolvedValue([
      {
        id: '1',
        title: 'Test Note',
        createdAt: '2026-01-01T00:00:00.000Z',
        aiNotes: 'Some AI notes',
        filePath: '/obsidian-vault/test.md',
      },
    ]);

    renderApp();

    expect(await screen.findByText('Test Note')).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    expect(screen.getByText('Some AI notes')).toBeInTheDocument();
  });
});
