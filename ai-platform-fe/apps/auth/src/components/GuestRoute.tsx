import { getMe } from '@libs/api';
import { queryKeys } from '@libs/store';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Spin } from 'antd';
import { type PropsWithChildren, useEffect } from 'react';

export default function GuestRoute({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const meQuery = useQuery({
    queryKey: queryKeys.auth.user,
    queryFn: () => getMe(),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.isSuccess) {
      void navigate({ to: '/chat' });
    }
  }, [meQuery.isSuccess, navigate]);

  if (meQuery.isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (meQuery.isError) {
    return <>{children}</>;
  }

  return null;
}
