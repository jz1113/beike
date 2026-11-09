import { expect, test as base } from '@playwright/test';

const localReads = new Set([
  '/api/health', '/api/system/config', '/api/system/models/pricing',
  '/api/catalog/skills', '/api/catalog/categories', '/api/catalog/category-skills',
  '/api/catalog/assets/deconstruct/jobs', '/api/assets/tasks', '/api/library/preferences',
  '/api/assistant/sessions', '/api/assistant/runs',
]);

export const test = base.extend<{ guarded: void }>({
  guarded: [async ({ context, baseURL }, use) => {
    const unexpected: string[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.origin !== baseURL) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (method === 'GET' && localReads.has(url.pathname) || method === 'PUT' && url.pathname === '/api/assistant/sessions') {
        return route.continue();
      }
      unexpected.push(method + ' ' + url.pathname);
      await route.abort();
    });
    await use();
    expect(unexpected, 'unmocked local API requests (blocked before reaching Go)').toEqual([]);
  }, { auto: true }],
});

export { expect };
