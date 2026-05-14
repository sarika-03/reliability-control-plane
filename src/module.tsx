import React, { Suspense, lazy } from 'react';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigProps } from './components/AppConfig/AppConfig';
import { ReliabilityControlPlaneSettings } from './types';

const LazyApp = lazy(() => import('./components/App/App'));
const LazyAppConfig = lazy(() => import('./components/AppConfig/AppConfig'));

const App = (props: AppRootProps) => (
  <Suspense fallback={<LoadingPlaceholder text="Loading Reliability Control Plane..." />}>
    <LazyApp {...props} />
  </Suspense>
);

const AppConfig = (props: AppConfigProps) => (
  <Suspense fallback={<LoadingPlaceholder text="Loading configuration..." />}>
    <LazyAppConfig {...props} />
  </Suspense>
);

export const plugin = new AppPlugin<ReliabilityControlPlaneSettings>().setRootPage(App).addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
