import { getMe } from '@libs/api';
import { queryKeys } from '@libs/store';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, isError, isSuccess } = useQuery({
    queryKey: queryKeys.auth.user,
    queryFn: getMe,
    retry: false,
  });

  useEffect(() => {
    if (isError) {
      window.location.href = 'http://localhost:3001/login';
    }
  }, [isError]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (isSuccess) {
    return children;
  }

  return null;
}
