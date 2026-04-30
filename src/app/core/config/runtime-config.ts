import { environment } from '../../../environments/environment';

export interface RuntimeConfigShape {
  googleMapsApiKey?: unknown;
}

declare global {
  var __FOOD_RESCUE_CONFIG__: RuntimeConfigShape | undefined;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function setRuntimeConfig(config: RuntimeConfigShape): void {
  globalThis.__FOOD_RESCUE_CONFIG__ = config;
}

export const runtimeConfig = {
  get googleMapsApiKey(): string {
    return normalizeString(globalThis.__FOOD_RESCUE_CONFIG__?.googleMapsApiKey) || environment.googleMapsApiKey.trim();
  },
};
