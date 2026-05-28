import { Outlet } from '@tanstack/react-router';
import { AppLayout } from '@libs/ui';

export function RootLayout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
