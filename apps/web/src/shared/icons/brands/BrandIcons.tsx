import React from 'react';

/**
 * 创作工具统一标识底座：三个工作台以不同线性图标区分功能，
 * 但共享尺寸、圆角与品牌渐变，避免在顶部出现三套不相干的 Logo。
 */
export function ToolSuiteMark({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-sm shadow-indigo-500/25 transition-transform group-hover:scale-105 ${className}`}>
      {children}
    </span>
  );
}

/**
 * 种草工坊 (Buyer Show Workshop) 品牌标志
 */
export function GrassWorkshopIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <img 
      src="/brand/workshop_icon.png" 
      alt="种草工坊" 
      draggable={false}
      className={`${className} object-contain flex-shrink-0 select-none pointer-events-none`}
    />
  );
}

/**
 * 京东 (JD.com) 官方标志 (JOY 吉祥物 + 经典红盾)
 */
export function JdIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <img 
      src="/brand/jd_logo.png" 
      alt="京东" 
      draggable={false}
      className={`${className} object-cover rounded-xl flex-shrink-0 select-none pointer-events-none`}
    />
  );
}

/**
 * 万邦电商 (OneBound) 官方品牌矢量标志
 */
export function OneBoundLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} flex-shrink-0 select-none`} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ob-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF7A00" />
          <stop offset="100%" stopColor="#E65100" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#ob-grad)" />
      {/* 像素方块科技感装饰 */}
      <rect x="18" y="10" width="5" height="5" fill="#FFFFFF" opacity="0.9" rx="1.5" />
      <rect x="24" y="13" width="4" height="4" fill="#FFFFFF" opacity="0.75" rx="1.5" />
      {/* 字母 O 与万邦橙色核心 */}
      <circle cx="17" cy="27" r="7.5" stroke="#FFFFFF" strokeWidth="4" />
      {/* 字母 B 与电商链路连接 */}
      <path 
        d="M26 19H34C36.2 19 38 20.8 38 23C38 24.8 36.8 26.2 35.2 26.8C37.2 27.4 38.5 29.2 38.5 31.2C38.5 33.5 36.5 35 34 35H26V19Z" 
        fill="#FFFFFF" 
      />
      <rect x="29.5" y="22.5" width="4.5" height="2.5" rx="0.8" fill="#E65100" />
      <rect x="29.5" y="28.5" width="5" height="3" rx="0.8" fill="#E65100" />
    </svg>
  );
}

/**
 * APIA 社媒多平台无水印解析矢量标志
 */
export function ApiaLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <img 
      src="/brand/apia_logo.png" 
      alt="APIA" 
      draggable={false}
      className={`${className} object-contain rounded-md bg-white border border-slate-100/80 p-0.5 flex-shrink-0 select-none pointer-events-none`} 
    />
  );
}

/**
 * 奇云 (Qiyun) 30+ 平台短视频/图集去水印官方标志
 */
export function QiyunLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <img 
      src="/brand/qiyun_logo.png" 
      alt="奇云" 
      draggable={false}
      className={`${className} object-contain rounded-full flex-shrink-0 select-none pointer-events-none`} 
    />
  );
}

/**
 * Comfly AI 网关官方微标
 */
export function ComflyLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <img 
      src="/brand/comfly_logo.png" 
      alt="Comfly" 
      draggable={false}
      className={`${className} object-contain rounded-full flex-shrink-0 select-none pointer-events-none`} 
    />
  );
}

/**
 * 全渠道智能采集中心双核微标 (万邦电商 + APIA 社媒)
 */
export function CollectorHubIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`flex ${className} flex-shrink-0 items-center justify-center gap-[9%] rounded-[28%] transition-transform group-hover:scale-105`}>
      {/* 两个来源图标并列呈现，避免在紧凑标题栏里相互遮挡。 */}
      <div className="flex h-[68%] w-[42%] items-center justify-center overflow-hidden rounded-[28%] border border-slate-200/80 bg-white p-px shadow-xs">
        <OneBoundLogo className="w-full h-full" />
      </div>
      <div className="flex h-[68%] w-[42%] items-center justify-center overflow-hidden rounded-[28%] border border-slate-200/80 bg-white p-px shadow-xs">
        <ApiaLogo className="w-full h-full" />
      </div>
    </div>
  );
}

/**
 * 淘宝 (Taobao) 官方极简标志
 */
export function TaobaoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#FF5000" />
      <text 
        x="50%" 
        y="52%" 
        dominantBaseline="central" 
        textAnchor="middle" 
        fill="#FFFFFF" 
        fontSize="12.5" 
        fontWeight="800" 
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
      >
        淘
      </text>
    </svg>
  );
}

/**
 * 贝壳科技集团 (Shell Technology Group) 品牌徽标
 */
export function ShellTechLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shellGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFDE21" />
          <stop offset="50%" stopColor="#FF9800" />
          <stop offset="100%" stopColor="#E65100" />
        </linearGradient>
      </defs>
      {/* 贝壳/云朵红色外轮廓 */}
      <path
        d="M28 72 C 16 72, 6 62, 6 50 C 6 42, 10 35, 17 31 C 15 22, 22 13, 31 11 C 38 9, 45 12, 49 17 C 54 10, 64 6, 73 9 C 83 12, 89 21, 88 31 C 94 36, 96 44, 93 52 C 90 60, 83 66, 75 67 C 70 73, 56 75, 46 73 Z"
        stroke="#EE2726"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* 内部金色 S 标志 */}
      <path
        d="M52 28 C 45 28, 40 33, 40 38 C 40 45, 54 44, 54 52 C 54 57, 49 61, 42 61 C 37 61, 34 58, 33 55"
        stroke="url(#shellGoldGrad)"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      {/* 右下角红点 */}
      <circle cx="73" cy="57" r="4" fill="#EE2726" />
    </svg>
  );
}

/**
 * 贝壳云图 (Beike Studio) 品牌微标 (极简光学镜头)
 */
export function VisionPulseLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" className="text-zinc-200" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" className="text-purple-400" />
      <circle cx="12" cy="12" r="2" fill="currentColor" className="text-white" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-zinc-400" />
    </svg>
  );
}

/**
 * 商品库图标 (极简包/资产栈，Linear / SF Symbols 风格)
 */
export function ProductVaultIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M10 12h4" />
    </svg>
  );
}

/**
 * 提示词库图标 (极简手册/文档，Linear / SF Symbols 风格)
 */
export function PromptVaultIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/**
 * 模型配置图标 (极简硬件/滑块控制，Linear / SF Symbols 风格)
 */
export function ModelSettingsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="12" cy="10" r="2" />
      <circle cx="20" cy="14" r="2" />
    </svg>
  );
}

/**
 * 提取按钮专用极简光标
 */
export function AIExtractIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * 下一步推进专用极简箭头
 */
export function WorkflowNextIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * 控制台 Studio 控制台图标
 */
export function StudioConsoleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

/**
 * 空状态摄影工作室光圈
 */
export function StudioEmptyLens({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

/**
 * 🌟 AI 模特试穿换装 3D 质感立体图标
 */
export function MannequinFittingIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative ${className} rounded-xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-pink-500 p-0.5 flex-shrink-0 shadow-md shadow-fuchsia-500/20 group-hover:scale-105 transition-all overflow-hidden flex items-center justify-center`}>
      <div className="w-full h-full rounded-[10px] bg-slate-950/20 backdrop-blur-xs flex items-center justify-center relative">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white drop-shadow-sm">
          {/* 衣架与身躯剪影 */}
          <path d="M12 2C10.9 2 10 2.9 10 4C10 4.7 10.4 5.3 11 5.7V7L4 10.5C3.4 10.8 3 11.4 3 12.1C3 13.1 3.9 14 5 14H6.5L8 21.5C8.1 22 8.6 22.5 9.1 22.5H14.9C15.4 22.5 15.9 22 16 21.5L17.5 14H19C20.1 14 21 13.1 21 12.1C21 11.4 20.6 10.8 20 10.5L13 7V5.7C13.6 5.3 14 4.7 14 4C14 2.9 13.1 2 12 2Z" fill="currentColor" fillOpacity="0.9" />
          {/* 光泽与腰线 */}
          <path d="M9.5 14C10.5 15 13.5 15 14.5 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          {/* 璀璨星标 */}
          <path d="M19 4L19.8 6.2L22 7L19.8 7.8L19 10L18.2 7.8L16 7L18.2 6.2L19 4Z" fill="#FDE047" />
        </svg>
      </div>
    </div>
  );
}

/**
 * 🌟 4K 超清画质增强 3D 镜头/钻石微标
 */
export function SuperResolution4KIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative ${className} rounded-xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-cyan-900 p-0.5 flex-shrink-0 shadow-md shadow-cyan-900/30 group-hover:scale-105 transition-all overflow-hidden flex items-center justify-center`}>
      <div className="w-full h-full rounded-[10px] bg-slate-950/40 backdrop-blur-xs flex items-center justify-center relative border border-cyan-400/30">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
          {/* 4K 标志与光学棱镜 */}
          <rect x="2.5" y="5.5" width="19" height="13" rx="3" stroke="#38BDF8" strokeWidth="1.6" />
          <path d="M7 14.5V9.5H9V12.5H11V9.5H12.5V14.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14.5 9.5V14.5M14.5 12L17.5 9.5M15.5 11.5L18 14.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="19" cy="5" r="1.5" fill="#38BDF8" />
        </svg>
      </div>
    </div>
  );
}

/**
 * 深度视频 · 单目深度估计立体图标
 */
export function DepthVideoIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative ${className} rounded-xl bg-gradient-to-tr from-slate-900 via-violet-950 to-indigo-900 p-0.5 flex-shrink-0 shadow-md shadow-violet-900/30 group-hover:scale-105 transition-all overflow-hidden flex items-center justify-center`}>
      <div className="w-full h-full rounded-[10px] bg-slate-950/40 backdrop-blur-xs flex items-center justify-center relative border border-violet-400/30">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#A78BFA" strokeWidth="1.5" />
          <path d="M6 16C8 12 10 10 12 10C14 10 16 12 18 16" stroke="#C4B5FD" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7 16C9 13 10.5 12 12 12C13.5 12 15 13 17 16" stroke="#EDE9FE" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
          <circle cx="12" cy="9" r="1.2" fill="#38BDF8" />
        </svg>
      </div>
    </div>
  );
}
