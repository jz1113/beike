// @vitest-environment happy-dom
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AssistantLiveStatus, { activityTarget } from '../components/AssistantLiveStatus';
import AssistantTurnList from '../AssistantTurnList';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('真实阶段逐步更新，计时且不伪造工具进度', () => {
  vi.useFakeTimers();
  const view=render(<AssistantLiveStatus message="正在连接" />);
  view.rerender(<AssistantLiveStatus message="正在接收回复" />);
  expect(screen.getByText('正在连接')).toBeTruthy();
  expect(screen.getByText('正在接收回复')).toBeTruthy();
  act(() => vi.advanceTimersByTime(21000));
  expect(screen.getByText('21s')).toBeTruthy();
  expect(screen.queryByText(/正在搜索/)).toBeNull();
});
it('已创建但尚无内容的消息仍显示等待状态', () => {
  render(<AssistantTurnList isSending items={[{id:'message',kind:'agentMessage',content:'',createdAt:Date.now()}]} streamingStatus="等待首段响应" />);
  expect(screen.getByText('等待首段响应')).toBeTruthy();
});
it('工具只提取可读目标，不把密钥等参数放到摘要中', () => {
  expect(activityTarget('{"query":"旅行场景","apiKey":"secret"}')).toBe('旅行场景');
  expect(activityTarget('{"apiKey":"secret"}')).toBe('');
  expect(activityTarget('{"query":')).toBe('');
});
it('历史空用户条目不再生成空气泡，工具后的筛选进度持续显示', () => {
 const {container}=render(<AssistantTurnList isSending streamingStatus="正在筛选素材 13–24，已保存12张" items={[
  {id:'empty',kind:'userMessage',content:'',createdAt:1},
  {id:'tool',kind:'toolCall',name:'collect',displayName:'采集图片',args:'{}',callId:'tool',status:'done',createdAt:2},
 ]} />);
 expect(container.querySelector('.ml-auto')).toBeNull();
 expect(screen.getByText('正在筛选素材 13–24，已保存12张')).toBeTruthy();
});
