import { Alert, Button, Form, Input } from 'antd';

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface LoginFormProps {
  loading?: boolean;
  error?: string;
  initialValues?: Partial<LoginFormValues>;
  onSubmit?: (values: LoginFormValues) => void;
}

export function LoginForm({ loading = false, error, initialValues, onSubmit }: LoginFormProps) {
  return (
    <Form<LoginFormValues>
      layout="vertical"
      initialValues={initialValues}
      onFinish={(values) => {
        onSubmit?.(values);
      }}
    >
      {error ? <Alert style={{ marginBottom: 16 }} type="error" title={error} showIcon /> : null}

      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: 'Please enter your email' },
          { type: 'email', message: 'Please enter a valid email' },
        ]}
      >
        <Input placeholder="you@example.com" autoComplete="email" />
      </Form.Item>

      <Form.Item
        label="Password"
        name="password"
        rules={[
          { required: true, message: 'Please enter your password' },
          { min: 8, message: 'Password must be at least 8 characters' },
        ]}
      >
        <Input.Password placeholder="Enter password" autoComplete="current-password" />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <Button type="primary" htmlType="submit" loading={loading} block>
          Sign in
        </Button>
      </Form.Item>
    </Form>
  );
}
