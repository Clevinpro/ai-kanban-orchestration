import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './app/app';

describe('chat', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders the chat app', () => {
    render(createElement(App));

    expect(screen.getByRole('heading', { name: 'AI Chat' })).toBeInTheDocument();
  });
});
