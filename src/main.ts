/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { setRuntimeConfig, type RuntimeConfigShape } from './app/core/config/runtime-config';

async function loadRuntimeConfig(path: string): Promise<RuntimeConfigShape> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      return {};
    }

    const payload = await response.json();
    return typeof payload === 'object' && payload !== null ? (payload as RuntimeConfigShape) : {};
  } catch {
    return {};
  }
}

async function bootstrap(): Promise<void> {
  const [defaultRuntimeConfig, localRuntimeConfig] = await Promise.all([
    loadRuntimeConfig('app-config.json'),
    loadRuntimeConfig('app-config.local.json'),
  ]);

  setRuntimeConfig({
    ...defaultRuntimeConfig,
    ...localRuntimeConfig,
  });

  await bootstrapApplication(App, appConfig);
}

void bootstrap().catch((err) => console.error(err));
