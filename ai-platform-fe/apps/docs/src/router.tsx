import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import App from './app/app';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });
