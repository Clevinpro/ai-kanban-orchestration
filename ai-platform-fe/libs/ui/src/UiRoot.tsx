import { ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

export function UiRoot({ children }: PropsWithChildren) {
  return <ConfigProvider>{children}</ConfigProvider>;
}
