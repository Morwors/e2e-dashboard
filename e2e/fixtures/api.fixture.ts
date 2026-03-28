/**
 * API fixture — extends Playwright test with a pre-configured ApiClient.
 * Use this for API-only tests that don't need a browser.
 */

import { test as base } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { URLS } from './test-data';

type ApiFixtures = {
  /** Unauthenticated API client */
  api: ApiClient;
};

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    const client = new ApiClient(request, URLS.api);
    await use(client);
  },
});

export { expect } from '@playwright/test';
