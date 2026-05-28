import { register } from '@libs/api';
import { RegisterForm } from '@libs/ui';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Card, Typography, message } from 'antd';

import GuestRoute from '../components/GuestRoute';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Could not create account';
}

function RegisterScreen() {
  const navigate = useNavigate();
  const loginPath = window.location.pathname.startsWith('/auth/') ? '/auth' : '/login';

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: () => {
      void navigate({ to: loginPath });
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Create account
        </Typography.Title>

        <RegisterForm
          loading={registerMutation.isPending}
          onSubmit={(values) => {
            registerMutation.mutate({
              name: values.name,
              email: values.email,
              password: values.password,
            });
          }}
        />

        <Typography.Paragraph style={{ marginBottom: 0, marginTop: 16 }}>
          Already have an account? <Link to={loginPath}>Sign in</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  return (
    <GuestRoute>
      <RegisterScreen />
    </GuestRoute>
  );
}

export default RegisterPage;
