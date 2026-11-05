import { createCreativeWorkflowProject } from './creativeWorkflowProjects';
export interface StoryProjectInput { title: string; brief: string; duration: number; ratio: string }
export function createStoryProject(input: StoryProjectInput, id: string, now: number) {
  if (!input.brief.trim()) throw new Error('请填写故事主题或商品创作要求');
  if (![15, 30, 60].includes(input.duration) || !['9:16', '16:9', '1:1'].includes(input.ratio)) throw new Error('请选择有效的时长与画幅');
  const project = createCreativeWorkflowProject('storyboard', id, now);
  project.title = input.title.trim() || '短片分镜';
  project.studioScene!.nodes = project.studioScene!.nodes.map(node => {
    const settings = node.settings as Record<string, unknown>;
    if (node.id === `${id}-source`) return { ...node, settings: { ...settings, text: `${input.brief.trim()}\n目标总时长：${input.duration} 秒\n画幅：${input.ratio}\n仅使用已核实的商品信息，不虚构功效或体验。` } };
    if (node.type === 'gen-image' || node.type === 'gen-video') return { ...node, settings: { ...settings, ratio: input.ratio } };
    return node;
  });
  return project;
}
