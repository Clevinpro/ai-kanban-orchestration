import { createRoute, createRootRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from './routes/__root';
import { IndexPage } from './routes/index';
import { ChatPage } from './routes/chat';
import { AgentPage } from './routes/agent';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatPage,
});

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agent',
  component: AgentPage,
});

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, agentRoute]);

export const router = createRouter({ routeTree });
