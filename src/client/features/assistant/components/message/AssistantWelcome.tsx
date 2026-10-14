import { useState } from 'react';
import { ArrowRight, Images, Link, RefreshCw, ScanLine, WandSparkles } from 'lucide-react';
import AssistantMark from '../AssistantMark';

interface Props { onUpload: () => void; onPrompt: (prompt: string) => void }

export default function AssistantWelcome({ onUpload, onPrompt }: Props) {
  const [page, setPage] = useState(0);
  const cards = [
    { id: 'reference', category: '参考图创作', title: '让一张图，开启新灵感', description: '上传参考图，一起探索画面与风格。', Icon: Images, tone: 'sage', action: onUpload },
    { id: 'idea', category: '头脑风暴', title: '把想法，变成创作方案', description: '从主题到分镜，梳理你的创作方向。', Icon: WandSparkles, tone: 'sand', action: () => onPrompt('我有一个创作想法，请先帮我梳理主题、风格和制作步骤。') },
    { id: 'link', category: '灵感采集', title: '从一个链接，发现灵感', description: '收集参考素材，整理值得借鉴的细节。', Icon: Link, tone: 'sage', action: () => onPrompt('请采集这个链接中的素材：') },
    { id: 'prompt', category: '画面构思', title: '把一句话，写成画面', description: '细化主体、构图与光影，打磨提示词。', Icon: ScanLine, tone: 'sand', action: () => onPrompt('请帮我把下面的想法整理成图片生成提示词，细化主体、构图、风格与光影：') },
  ];
  return <div className="agent-welcome">
    <div className="agent-welcome-intro">
      <div className="agent-welcome-brand"><span className="agent-welcome-mark"><AssistantMark /></span><span>你好，我是贝壳</span></div>
      <h2>今天，一起创作点什么？</h2>
    </div>
    <div className="agent-start-cards" aria-label="开始创作">
      {cards.slice(page * 2, page * 2 + 2).map(({ id, category, title, description, Icon, tone, action }) => <button type="button" className="agent-start-card" data-tone={tone} key={id} onClick={action}>
        <span className="agent-start-category"><Icon size={15} /><span>{category}</span><ArrowRight className="agent-start-arrow" size={16} /></span>
        <strong>{title}</strong>
        <span className="agent-start-description">{description}</span>
      </button>)}
    </div>
    <div className="agent-welcome-bottom"><button type="button" onClick={() => setPage(current => (current + 1) % 2)} aria-label="换一组创作建议" title="换一组创作建议"><RefreshCw size={14} /></button></div>
  </div>;
}
