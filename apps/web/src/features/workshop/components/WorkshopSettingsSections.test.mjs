import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkshopContentSettings, WorkshopOutputSettings, WorkshopExecutionSettings } from './WorkshopSettingsSections.tsx';

const props = {
  selectedArchId: 'phone', recipes: [{ id: 'phone', name: '手机通讯' }],
  selectedShotCount: 4, selectedAspect: '3:4', selectedQuality: 'high', generationStrategy: 'grid_first',
  selectedVisionModel: 'vision', availableVisionModels: [{ id: 'vision', name: '分析模型' }],
  selectedImageGenModel: 'image', availableImageModels: [{ id: 'image', name: '生图模型' }],
  analyzeConcurrency: 4, imageGenConcurrency: 16, autoGenerateCopywriting: false,
  setSelectedArchId() {}, setSelectedShotCount() {}, setSelectedAspect() {}, setSelectedQuality() {},
  setGenerationStrategy() {}, setSelectedVisionModel() {}, setSelectedImageGenModel() {},
  setAutoGenerateCopywriting() {}, setAnalyzeConcurrency() {}, setImageGenConcurrency() {},
};
const render = (Component, overrides = {}) => renderToStaticMarkup(React.createElement(Component, { ...props, ...overrides }));
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

test('content, output and execution settings have separate responsibilities', () => {
  const content = render(WorkshopContentSettings);
  assert.match(content, /拍摄类型/);
  assert.match(content, /图组来源/);
  assert.match(content, /可用素材/);
  assert.doesNotMatch(content, /视觉分析模型|生图并发|交付画质/);
  const output = render(WorkshopOutputSettings);
  assert.match(output, /交付规格/);
  assert.doesNotMatch(output, /图组来源|视觉分析模型/);
  const execution = render(WorkshopExecutionSettings);
  assert.match(execution, /视觉分析模型/);
  assert.match(execution, /生图后自动生成文案/);
  assert.doesNotMatch(execution, /图组来源|交付画质/);
});

test('switching from eight single shots to a grid resets shot count before strategy', () => {
  const calls = [];
  const tree = WorkshopOutputSettings({ ...props, selectedShotCount: 8, generationStrategy: 'single_shot',
    setSelectedShotCount: value => calls.push(['shots', value]), setGenerationStrategy: value => calls.push(['strategy', value]),
  });
  elements(tree).find(node => node.type === 'input' && node.props.value === 'grid_first').props.onChange();
  assert.deepEqual(calls, [['shots', 4], ['strategy', 'grid_first']]);
});

test('grid locks shot count and explains whole-image quality; single shots offer eight', () => {
  const gridTree = WorkshopOutputSettings(props);
  const count = elements(gridTree).find(node => node.type === 'select' && node.props['aria-label'] === '分镜数量');
  assert.equal(count.props.disabled, true);
  assert.match(render(WorkshopOutputSettings), /画质应用于整张四宫格/);
  assert.doesNotMatch(render(WorkshopOutputSettings), /原组扩写/);
  const single = render(WorkshopOutputSettings, { generationStrategy: 'single_shot' });
  assert.match(single, /8 镜（原组扩写）/);
  assert.match(single, /画质应用于每张独立生成的图片/);
});

test('resource failure and loading states remain actionable in content settings', () => {
  assert.match(render(WorkshopContentSettings, { assetLoadState: 'error', assetLoadError: '连接失败' }), /role="alert"/);
  assert.match(render(WorkshopContentSettings, { assetLoadState: 'error', assetLoadError: '连接失败' }), /连接失败/);
  assert.match(render(WorkshopContentSettings, { assetLoadState: 'loading' }), /此时不能启动分析/);
});

test('aspect selection exposes its pressed state and dispatches the chosen ratio', () => {
  let selected;
  const tree = WorkshopOutputSettings({ ...props, setSelectedAspect: value => { selected = value; } });
  const buttons = elements(tree).filter(node => node.type === 'button');
  assert.equal(buttons.filter(node => node.props['aria-pressed']).length, 1);
  buttons.find(node => React.Children.toArray(node.props.children).includes('9:16')).props.onClick();
  assert.equal(selected, '9:16');
});

test('missing optional concurrency setters render read-only controls', () => {
  const tree = WorkshopExecutionSettings({ ...props, setAnalyzeConcurrency: undefined, setImageGenConcurrency: undefined });
  const selects = elements(tree).filter(node => node.type === 'select' && /并发/.test(node.props['aria-label']));
  assert.equal(selects.length, 2);
  assert.ok(selects.every(node => node.props.disabled));
});
