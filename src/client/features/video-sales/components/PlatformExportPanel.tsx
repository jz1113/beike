import { useState } from 'react';
import {
  Download,
  Share2,
  Copy,
  Check,
  RotateCcw,
  Heart,
  MessageCircle,
  Bookmark,
  ShoppingBag,
  Smartphone,
} from 'lucide-react';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';

interface Props {
  script: VideoSalesScript;
  resultUrl: string;
  onRestart: () => void;
}

export function PlatformExportPanel({
  script,
  resultUrl,
  onRestart,
}: Props) {
  const [platform, setPlatform] = useState<'douyin' | 'xiaohongshu'>('douyin');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyFullSEO = () => {
    const full = `【标题】${script.seo.title}\n【标签】${script.seo.hashtags.join(' ')}\n【封面大字】${script.seo.coverText}\n【文案】${script.seo.description}\n【互动话术】${script.seo.interactionGuide}`;
    copyText('full', full);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${script.title || '带货短视频'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-6">
      {/* 顶部平台切换 */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
        <div className="flex items-center gap-3">
          <Smartphone className="w-5 h-5 text-indigo-500" />
          <div>
            <span className="text-sm font-bold text-slate-800 dark:text-[#EDEDED] block">
              真机模拟器画幅切换
            </span>
            <span className="text-[11px] text-slate-400">
              真实预览移动端点赞、购物车与标题排版效果
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlatform('douyin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              platform === 'douyin'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
            }`}
          >
            抖音 / 快手 (9:16)
          </button>
          <button
            type="button"
            onClick={() => setPlatform('xiaohongshu')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              platform === 'xiaohongshu'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
            }`}
          >
            小红书 (3:4)
          </button>
        </div>
      </div>

      {/* 主展示区：左侧真机模型，右侧 SEO 物料与操作 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* 左侧：真机模拟带壳画幅 */}
        <div className="md:col-span-5 flex justify-center">
          <div
            className={`relative rounded-[36px] p-3 bg-slate-950 border-4 border-slate-800 shadow-2xl overflow-hidden transition-all duration-300 ${
              platform === 'douyin' ? 'w-[300px] h-[580px]' : 'w-[320px] h-[520px]'
            }`}
          >
            {/* 手机听筒/药丸微孔 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-30" />

            {/* 画面播放区 */}
            <div className="w-full h-full rounded-[28px] overflow-hidden relative bg-black flex items-center justify-center">
              {resultUrl.endsWith('.mp4') ? (
                <video
                  src={resultUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={resultUrl}
                  alt="成片预览"
                  className="w-full h-full object-cover"
                />
              )}

              {/* 手机界面拟真浮层：右侧互动按钮 */}
              <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white z-20 drop-shadow-md">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                  </div>
                  <span className="text-[10px] font-bold mt-0.5">8.9w</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold mt-0.5">4,321</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Bookmark className="w-5 h-5 text-amber-400 fill-amber-400" />
                  </div>
                  <span className="text-[10px] font-bold mt-0.5">1.2w</span>
                </div>
              </div>

              {/* 手机界面拟真浮层：底部带货小黄车与标题文案 */}
              <div className="absolute bottom-4 left-3 right-16 text-white z-20 space-y-1.5 drop-shadow-md">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[10px] font-extrabold shadow-lg">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>点击购买·同款品质好物</span>
                </div>
                <div className="font-bold text-xs leading-snug line-clamp-2">
                  @{script.seo.title}
                </div>
                <div className="text-[10px] opacity-80 line-clamp-1">
                  {script.seo.hashtags.join(' ')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：全套 SEO 标签、下载与分享 */}
        <div className="md:col-span-7 space-y-5">
          {/* 下载成片与一键发布 */}
          <div className="p-5 rounded-2xl bg-indigo-500/[0.06] border border-indigo-500/20 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-white block">
                成片渲染完成
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                H.264 1080P 高清高码率标准成片
              </span>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="px-6 py-2.5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              下载本地 MP4
            </button>
          </div>

          {/* SEO 物料矩阵卡片 */}
          <SpotlightCard className="p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
              <span className="text-xs font-bold text-slate-800 dark:text-[#EDEDED] flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-500" />
                电商平台 SEO 物料矩阵
              </span>
              <button
                type="button"
                onClick={copyFullSEO}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {copiedKey === 'full' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'full' ? '已复制全套' : '一键复制全套'}</span>
              </button>
            </div>

            {/* 1. 爆款标题 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>短视频吸睛标题</span>
                <button
                  type="button"
                  onClick={() => copyText('title', script.seo.title)}
                  className="hover:text-indigo-500 transition-colors"
                >
                  {copiedKey === 'title' ? '已复制' : '复制'}
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 text-xs font-semibold text-slate-800 dark:text-[#EDEDED]">
                {script.seo.title}
              </div>
            </div>

            {/* 2. 封面文案与话题标签 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>封面大字</span>
                  <button
                    type="button"
                    onClick={() => copyText('cover', script.seo.coverText)}
                    className="hover:text-indigo-500"
                  >
                    {copiedKey === 'cover' ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 text-xs font-bold text-rose-500">
                  {script.seo.coverText}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>互动评论引导语</span>
                  <button
                    type="button"
                    onClick={() => copyText('guide', script.seo.interactionGuide)}
                    className="hover:text-indigo-500"
                  >
                    {copiedKey === 'guide' ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 text-xs text-slate-700 dark:text-slate-300 truncate">
                  {script.seo.interactionGuide}
                </div>
              </div>
            </div>

            {/* 3. 话题标签云 */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-400 block">推荐热门标签</span>
              <div className="flex flex-wrap gap-1.5">
                {script.seo.hashtags.map((tag, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => copyText(`tag_${i}`, tag)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 视频描述正文 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>视频描述正文</span>
                <button
                  type="button"
                  onClick={() => copyText('desc', script.seo.description)}
                  className="hover:text-indigo-500"
                >
                  {copiedKey === 'desc' ? '已复制' : '复制'}
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {script.seo.description}
              </div>
            </div>
          </SpotlightCard>

          {/* 重新制作按钮 */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onRestart}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>制作下一条商品带货视频</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
