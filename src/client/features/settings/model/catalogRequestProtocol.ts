export type CatalogProtocol = 'openai' | 'gemini' | 'anthropic';

/** Catalog transport is channel configuration, independent of a selected model's text protocol. */
export function catalogRequestProtocol(providerType: unknown = 'openai', catalogProtocol?: unknown) {
  const type = typeof providerType === 'string' && providerType ? providerType : 'openai';
  const protocol = catalogProtocol === 'openai' || catalogProtocol === 'gemini' || catalogProtocol === 'anthropic'
    ? catalogProtocol : type === 'gemini' || type === 'anthropic' ? type : 'openai';
  return { providerType: type, catalogProtocol: protocol as CatalogProtocol };
}
