import { Alert, Button, Form, Input } from 'antd';

export interface RegisterFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterFormProps {
  loading?: boolean;
  error?: string;
  initialValues?: Partial<RegisterFormValues>;
  onSubmit?: (values: RegisterFormValues) => void;
}

export function RegisterForm({
  loading = false,
  error,
  initialValues,
  onSubmit,
}: RegisterFormProps) {
  return (
    <Form<RegisterFormValues>
      layout="vertical"
      initialValues={initialValues}
      onFinish={(values) => {
        onSubmit?.(values);
      }}
    >
      {error ? <Alert style={{ marginBottom: 16 }} type="error" title={error} showIcon /> : null}

      <Form.Item
        label="Name"
        name="name"
        rules={[
          { required: true, message: 'Please enter your name' },
          { min: 2, message: 'Name must be at least 2 characters' },
        ]}
      >
        <Input placeholder="Your name" autoComplete="name" />
      </Form.Item>

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
          { required: true, message: 'Please create a password' },
          { min: 8, message: 'Password must be at least 8 characters' },
        ]}
      >
        <Input.Password placeholder="Create password" autoComplete="new-password" />
      </Form.Item>

      <Form.Item
        label="Confirm password"
        name="confirmPassword"
        dependencies={['password']}
        rules={[
          { required: true, message: 'Please confirm your password' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('password') === value) {
                return Promise.resolve();
              }

              return Promise.reject(new Error('Passwords do not match'));
            },
          }),
        ]}
      >
        <Input.Password placeholder="Confirm password" autoComplete="new-password" />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <Button type="primary" htmlType="submit" loading={loading} block>
          Create account
        </Button>
      </Form.Item>
    </Form>
  );
}
