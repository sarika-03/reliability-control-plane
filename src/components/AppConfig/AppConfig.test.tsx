import React from 'react';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { PluginType } from '@grafana/data';
import AppConfig, { AppConfigProps } from './AppConfig';

describe('Components/AppConfig', () => {
  let props: AppConfigProps;

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        measureText: () => ({ width: 120 }),
      }),
    });
  });

  beforeEach(() => {
    jest.resetAllMocks();

    props = {
      plugin: {
        meta: {
          id: 'sample-app',
          name: 'Sample App',
          type: PluginType.app,
          enabled: true,
          jsonData: {},
        },
      },
      query: {},
    } as unknown as AppConfigProps;
  });

  test('renders telemetry datasource settings', () => {
    const plugin = { meta: { ...props.plugin.meta, enabled: false } };

    // @ts-ignore - We don't need to provide `addConfigPage()` and `setChannelSupport()` for these tests
    render(<AppConfig plugin={plugin} query={props.query} />);

    expect(screen.queryByRole('group', { name: /telemetry datasource settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /prometheus datasource/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /loki datasource/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /tempo datasource/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save datasource settings/i })).toBeInTheDocument();
  });
});
