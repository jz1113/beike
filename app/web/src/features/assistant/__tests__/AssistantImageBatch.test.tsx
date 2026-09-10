import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssistantImageBatch } from '../AssistantBatchPanel';
import { useAppStore } from '@/store';
const content = '### 第 1 张 封面\n```text\n实拍 @图片1\n```\n### 第 2 张 正文\n```text\n光影 @图片2\n```';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('disables an older reply when a newer prompt batch exists', () => {
  useAppStore.setState({ currentAssistantSessionId: 'versions', assistantSessions: [{ id: 'versions', title: 'test', createdAt: 1, updatedAt: 1, messages: [
    { id: 'v1', role: 'assistant', content, timestamp: 1 },
    { id: 'v2', role: 'assistant', content: content + '\n优化版', timestamp: 2 },
  ] }] });
  render(<AssistantImageBatch content={content} referenceMedia={[]} />);
  expect((screen.getByText('请使用最新版本') as HTMLButtonElement).disabled).toBe(true);
  useAppStore.setState({ assistantSessions: [] });
});
it('restores the result link from the reply execution record', () => {
  useAppStore.setState({ currentAssistantSessionId: 'saved', assistantSessions: [{ id: 'saved', title: 'test', createdAt: 1, updatedAt: 1, messages: [
    { id: 'v1', role: 'assistant', content, timestamp: 1, imageBatchSessionId: 'existing-results' },
  ] }] });
  const { unmount } = render(<AssistantImageBatch content={content} referenceMedia={[]} />);
  expect(screen.getByText('查看本组结果')).toBeTruthy();
  unmount();
  render(<AssistantImageBatch content={content} referenceMedia={[]} />);
  expect(screen.queryByText('批量生成')).toBeNull();
  useAppStore.setState({ assistantSessions: [] });
});
it('queues selected prompts once and opens the shared results session', () => {
  const add = vi.fn(() => useAppStore.setState({ currentSessionId: 'batch-session' }));
  const navigate = vi.fn();
  useAppStore.setState({ quickModel: 'gpt-image-2', addBatchGenerationTasks: add, setCurrentView: navigate });
  render(<AssistantImageBatch content={content} referenceMedia={[1, 2].map(n => ({ type: 'image', url: `https://example.com/${n}.jpg` }))} />);
  fireEvent.click(screen.getByText('批量生成'));
  fireEvent.click(screen.getByText('生成选中的 2 张'));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0]?.length).toBe(3);
  expect(navigate).toHaveBeenCalledWith('generate');
  expect(screen.getByText('查看本组结果')).toBeTruthy();
});
it('keeps the batch unsubmitted and displays the missing page', () => {
  const add = vi.fn();
  useAppStore.setState({ quickModel: 'gpt-image-2', addBatchGenerationTasks: add });
  render(<AssistantImageBatch content={content} referenceMedia={[]} />);
  fireEvent.click(screen.getByText('批量生成'));
  fireEvent.click(screen.getByText('生成选中的 2 张'));
  expect(add).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('第 1 张 封面');
});
it('submits only revised pages, not old examples or trailing keyword blocks', () => {
  const add = vi.fn((...args: unknown[]) => { void args; useAppStore.setState({currentSessionId:'revised-result'}); });
  const revised = '以前不要再写：\n```text\n旧版光影拼贴\n```\n' + content + '\n### 修改方向\n真实感关键词可以反复使用：\n```text\n原相机，抓拍\n```';
  useAppStore.setState({quickModel:'gpt-image-2',addBatchGenerationTasks:add, currentAssistantSessionId:'revision-check', assistantSessions:[{id:'revision-check',title:'test',createdAt:1,updatedAt:2,messages:[{id:'old',role:'assistant',content,timestamp:1},{id:'new',role:'assistant',content:revised,timestamp:2}]}]});
  render(<AssistantImageBatch content={revised} referenceMedia={[1,2].map(n => ({type:'image',url:`https://example.com/${n}.jpg`}))} />);
  fireEvent.click(screen.getByText('批量生成'));
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(screen.getByText('生成选中的 2 张'));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0][0]).toHaveLength(2);
  expect(JSON.stringify(add.mock.calls[0][0])).not.toMatch(/旧版|原相机/);
});
