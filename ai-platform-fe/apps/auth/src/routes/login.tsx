import { getGoogleOAuthStartURL, login } from '@libs/api';
import { LoginForm } from '@libs/ui';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, Card, message } from 'antd';
import { useState } from 'react';

import GuestRoute from '../components/GuestRoute';

const LOGIN_FAILED = 'Could not sign in. Check your email and password.';

function LoginScreen() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string>();

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      void navigate({ to: '/chat' });
    },
    onError: () => {
      setFormError(LOGIN_FAILED);
      message.error(LOGIN_FAILED);
    },
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card title="AI Platform" style={{ width: '100%', maxWidth: 420 }}>
        <LoginForm
          loading={loginMutation.isPending}
          error={formError}
          onSubmit={(values) => {
            setFormError(undefined);
            loginMutation.mutate(values);
          }}
        />

        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <Link to="/auth/register">No account? Register</Link>
        </div>

        <Button
          block
          onClick={() => {
            window.location.href = getGoogleOAuthStartURL();
          }}
        >
          Sign in with Google
        </Button>
      </Card>
    </div>
  );
}

export function LoginPage() {
  return (
    <GuestRoute>
      <LoginScreen />
    </GuestRoute>
  );
}

export default LoginPage;
