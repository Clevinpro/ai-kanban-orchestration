import { createRoute, createRootRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from './routes/__root';
import { IndexPage } from './routes/index';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, registerRoute]);

export const router = createRouter({ routeTree });
