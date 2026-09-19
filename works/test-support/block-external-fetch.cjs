// Test processes may access their local services only; never spend real gateway credits.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new globalThis.URL(typeof input === 'string' ? input : input instanceof globalThis.URL ? input.href : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return Promise.reject(new Error('External network disabled for local integration tests'));
  }
  return originalFetch(input, init);
};
