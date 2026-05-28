import * as React from 'react';
import {
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { UiRoot } from '@libs/ui';

const AuthLogin = React.lazy(() => import('auth/Module'));
const AuthRegister = React.lazy(() =>
  import('auth/Module').then((m) => ({ default: m.RegisterPage })),
);
const ChatPage = React.lazy(() => import('chat/Module').then((m) => ({ default: m.ChatPage })));

function ComingSoon() {
  return <div>Coming soon...</div>;
}

function ShellHome() {
  return <Navigate to="/auth" />;
}

const rootRoute = createRootRoute({
  component: () => (
    <UiRoot>
      <React.Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </React.Suspense>
    </UiRoot>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ShellHome,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: AuthLogin,
});

const authRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/register',
  component: AuthRegister,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatPage,
});

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs',
  component: ComingSoon,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  authRegisterRoute,
  chatRoute,
  docsRoute,
]);

export const router = createRouter({ routeTree });
