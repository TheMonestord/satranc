import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // Sistemde kurulu Chrome kullanılır; ayrıca tarayıcı indirmek gerekmez.
    channel: 'chrome',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
