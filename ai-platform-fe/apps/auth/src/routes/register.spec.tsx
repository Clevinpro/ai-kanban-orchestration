import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterPage } from './register';

const navigateMock = vi.fn();
const registerMock = vi.fn();
const getMeMock = vi.fn();
const messageErrorMock = vi.spyOn(message, 'error').mockImplementation(() => undefined);

vi.mock('@libs/api', () => ({
  register: (dto: unknown) => registerMock(dto),
  getMe: () => getMeMock(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: unknown }) => <a href="/auth">{children}</a>,
  useNavigate: () => navigateMock,
}));

function renderRegisterPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
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
    window.history.pushState({}, '', '/auth/register');
    registerMock.mockReset();
    getMeMock.mockReset();
    getMeMock.mockRejectedValue(new Error('Unauthorized'));
    navigateMock.mockReset();
    messageErrorMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('submits valid registration data and navigates to auth login', async () => {
    registerMock.mockResolvedValue({ status: 201 });

    renderRegisterPage();

    fireEvent.change(await screen.findByPlaceholderText('Your name'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Create password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });
    });
    expect(navigateMock).toHaveBeenCalledWith({ to: '/auth' });
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('shows api error message when registration fails', async () => {
    registerMock.mockRejectedValue(new Error('User already exists'));

    renderRegisterPage();

    fireEvent.change(await screen.findByPlaceholderText('Your name'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Create password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('User already exists');
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
