import { describe, expect, it } from 'vitest';
import { groupModelsByGeneration } from '@shared/domain/models/modelGrouping';
import { listModelChannels, modelsInChannel } from './modelPickerChannels';

const models = [
  { id: 'a-gemini', upstreamId: 'gemini-3-flash', provider: '网关甲', name: 'Gemini · 网关甲' },
  { id: 'b-gemini', upstreamId: 'gemini-3-flash', provider: '网关乙', name: 'Gemini · 网关乙' },
  { id: 'b-claude', upstreamId: 'claude-sonnet-4-5', provider: '网关乙', name: 'Claude' },
  { id: 'plain', upstreamId: 'gpt-5.6-sol', name: 'GPT' },
];

describe('model picker channels', () => {
  it('splits one upstream model across gateways and keeps generation groups inside a channel', () => {
    expect(listModelChannels(models)).toEqual(['网关甲', '网关乙', '默认']);
    const gateway = modelsInChannel(models, '网关乙');
    expect(gateway.map((model) => model.id)).toEqual(['b-gemini', 'b-claude']);
    const sections = groupModelsByGeneration(gateway.map((model) => model.upstreamId), 'chat');
    const labels = sections.flatMap((section) => section.rows.filter((row) => !row.isArchived).map((row) => row.generationLabel));
    expect(labels.some((label) => label.includes('Gemini'))).toBe(true);
    expect(labels.some((label) => label.includes('Claude'))).toBe(true);
    expect(labels.join(' ')).not.toContain('gemini-3-flash');
  });
});
