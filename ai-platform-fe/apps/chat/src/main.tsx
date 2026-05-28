import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from '@libs/store';
import { ProtectedRoute } from '@libs/ui';
import { router } from './router';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProtectedRoute>
        <RouterProvider router={router} />
      </ProtectedRoute>
    </QueryClientProvider>
  </StrictMode>,
);
