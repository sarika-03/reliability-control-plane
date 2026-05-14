import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import { ROUTES } from '../../constants';
import { ReliabilityControlPlaneSettings } from '../../types';

const OverviewPage = React.lazy(() => import('../../pages/OverviewPage'));
const ServicesPage = React.lazy(() => import('../../pages/ServicesPage'));
const IncidentsPage = React.lazy(() => import('../../pages/IncidentsPage'));
const TopologyPage = React.lazy(() => import('../../pages/TopologyPage'));

function App(props: AppRootProps) {
  const settings = props.meta.jsonData as ReliabilityControlPlaneSettings;

  return (
    <Suspense fallback={<LoadingPlaceholder text="Loading page..." />}>
      <Routes>
        <Route index element={<OverviewPage settings={settings} />} />
        <Route path={ROUTES.Overview} element={<OverviewPage settings={settings} />} />
        <Route path={ROUTES.Services} element={<ServicesPage settings={settings} />} />
        <Route path={ROUTES.Incidents} element={<IncidentsPage settings={settings} />} />
        <Route path={ROUTES.Topology} element={<TopologyPage settings={settings} />} />
        <Route path="*" element={<OverviewPage settings={settings} />} />
      </Routes>
    </Suspense>
  );
}

export default App;
