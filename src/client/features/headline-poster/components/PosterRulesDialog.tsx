import type { ReactNode } from 'react';
import { Info, Settings2, X } from 'lucide-react';
import { PosterDialogFrame } from './PosterDialogFrame';
import { COVER_FORMATS } from '../model/coverFormat';
import { modelLabel, type PosterProductionSettings } from '../model/posterTypes';

interface Props {
  settings: PosterProductionSettings;
  imageModels: Array<{ id: string; name?: string; shortName?: string }>;
  titleModels: Array<{ id: string; name?: string; shortName?: string }>;
  onClose: () => void;
  onOpenSettings: () => void;
}

function RuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <div className="text-[13px] leading-6 text-slate-600">{children}</div>
    </section>
  );
}

export function PosterRulesDialog({ settings, imageModels, titleModels, onClose, onOpenSettings }: Props) {
  const imageModel = modelLabel(imageModels.find((model) => model.id === settings.imageModel), settings.imageModel);
  const titleModel = modelLabel(titleModels.find((model) => model.id === settings.titleModel), settings.titleModel);
  const quality = { low: '1K', medium: '2K', high: '4K' }[settings.imageQuality];

  return (
    <PosterDialogFrame label="大字报生成规则" onClose={onClose} backdropClassName="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]" className="flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_70px_-28px_rgba(15,23,42,.45)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950">当前生成规则</h2>
            <p className="mt-1 text-xs text-slate-500">固定规则作用于每条任务；模型、标题处理和并行数量可在生产设置中调整。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭生成规则" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <RuleSection title="1 · 导入与版式">
              <p>表格识别图片链接、原标题、文字方向和可选的商品名称/型号；没有表头时按前四列读取。文字方向为空时按竖版处理，填了无法识别的值会标记失败。</p>
              <p className="mt-1">文字竖：{COVER_FORMATS.portrait.aspectRatio}，{COVER_FORMATS.portrait.width} × {COVER_FORMATS.portrait.height}；文字横：{COVER_FORMATS.square.aspectRatio}，{COVER_FORMATS.square.width} × {COVER_FORMATS.square.height}。</p>
            </RuleSection>
            <RuleSection title="2 · 标题处理">
              <p>选择 AI 改写时，结合参考图和原标题生成 7–12 个纯中文字符；保留可核实的观点或场景，不编造商品信息。手动修改过的封面标题不会再被自动覆盖。</p>
              <p className="mt-1">选择保留原标题时，跳过改写，直接把原标题交给封面设计阶段。</p>
            </RuleSection>
            <RuleSection title="3 · 画面设计">
              <p>先生成一份完整设计方案，再用参考图一次生图完成商品、场景和艺术字；不会先出无字底图再本地叠字。设计提示词锁定标题逐行文字，提供商品名称/型号时也要求原样写入。成图文字仍需人工核对。</p>
              <p className="mt-1">保留商品自身真实标识，不照搬参考图外部营销文字；不虚构价格、功效或体验。重复的图片会轮换字效与配色方向。</p>
            </RuleSection>
            <RuleSection title="4 · 成品与失败处理">
              <p>成品为固定版式的 JPG，文件大于 200 KB 且严格小于 5 MB。生图比例不符、标题或设计方案未通过校验时会停止该条任务，并保留失败原因供手动重试。</p>
              <p className="mt-1">停止操作会停止等待，已提交的生图任务仍可能继续执行；恢复或重试时先核对原任务结果。导入错误需要修正表格后重新导入。</p>
              <p className="mt-1">打包下载包含成品图、生成记录，以及逐条完整设计与提示词 JSON。</p>
            </RuleSection>
          </div>

          <section className="rounded-2xl bg-slate-50 px-4 py-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-black text-slate-800"><Info className="h-3.5 w-3.5" />当前生产设置</div>
            <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
              <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate-500">标题处理</dt><dd className="truncate font-semibold text-slate-800">{settings.titleHandling === 'rewrite' ? 'AI 改写' : '保留原标题'}</dd></div>
              <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate-500">设计模型</dt><dd className="truncate font-semibold text-slate-800">{titleModel}</dd></div>
              <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate-500">生图模型</dt><dd className="truncate font-semibold text-slate-800">{imageModel} · {quality}</dd></div>
              <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate-500">并行任务</dt><dd className="font-semibold text-slate-800">{settings.concurrency} 条</dd></div>
              <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate-500">最终输出</dt><dd className="font-semibold text-slate-800">按导入版式固定尺寸</dd></div>
            </dl>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900">关闭</button>
          <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold text-white hover:bg-slate-800"><Settings2 className="h-3.5 w-3.5" />调整生产设置</button>
        </footer>
    </PosterDialogFrame>
  );
}
