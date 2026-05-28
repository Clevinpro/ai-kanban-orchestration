import { Layout } from 'antd';
import type { ReactNode } from 'react';

const { Header, Sider, Content } = Layout;

export interface AppLayoutProps {
  /** Top bar content (logo, user menu, etc.) */
  header?: ReactNode;
  /** Left navigation */
  sidebar?: ReactNode;
  /** Main page body */
  children?: ReactNode;
}

export function AppLayout({ header, sidebar, children }: AppLayoutProps) {
  // TODO: responsive sider collapse, theme tokens, breadcrumbs
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 16 }}>{header}</Header>
      <Layout>
        <Sider width={240} theme="light" style={{ borderInlineEnd: '1px solid #f0f0f0' }}>
          {sidebar}
        </Sider>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
