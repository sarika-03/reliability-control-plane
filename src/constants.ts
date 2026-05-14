import pluginJson from './plugin.json';

export const PLUGIN_BASE_URL = `/a/${pluginJson.id}`;
export const PLUGIN_NAME = pluginJson.name;

export enum ROUTES {
  Overview = 'overview',
  Services = 'services',
  Incidents = 'incidents',
  Topology = 'topology',
}
