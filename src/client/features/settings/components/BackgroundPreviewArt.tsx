import type { AppBackgroundStyle } from '@client/shared/media/backgrounds/backgroundCatalog';

export function BackgroundPreviewArt({
  style,
  isDark,
  accent,
}: {
  style: AppBackgroundStyle;
  isDark: boolean;
  accent: string;
}) {
  const bg = isDark ? '#0D0F14' : '#F6F7FA';

  if (style === 'clean') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
        <div
          className="absolute left-1/2 top-[-18%] h-[90%] w-[120%] -translate-x-1/2 rounded-full blur-xl"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.55), rgba(168, 85, 247, 0.16), transparent 72%)'
              : 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.42), rgba(147, 197, 253, 0.2), transparent 72%)',
          }}
        />
      </div>
    );
  }

  if (style === 'shards') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
        {/* 背景深邃光晕 */}
        <div
          className="absolute inset-0 blur-xl opacity-30"
          style={{
            background: `radial-gradient(circle at 55% 45%, ${accent} 0%, transparent 65%)`,
          }}
        />

        <svg className="h-full w-full" viewBox="0 0 240 180" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {/* 测绘十字标记 */}
          <g stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} strokeWidth="1">
            <path d="M 35 30 L 45 30 M 40 25 L 40 35" />
            <path d="M 195 40 L 205 40 M 200 35 L 200 45" />
            <path d="M 120 145 L 130 145 M 125 140 L 125 150" />
            <path d="M 210 135 L 220 135 M 215 130 L 215 140" />
          </g>

          {/* 远景虚化碎片 */}
          <g opacity={isDark ? 0.35 : 0.25}>
            <polygon points="50,110 75,95 85,115 60,128" fill={accent} />
            <polygon points="170,55 190,45 195,65 178,72" fill={accent} />
            <polygon points="135,120 155,108 162,125 145,134" fill={accent} />
          </g>

          {/* 中景透光玻璃碎片带 */}
          <g opacity={isDark ? 0.7 : 0.55} stroke={accent} strokeWidth="1">
            <polygon points="70,75 110,50 125,78 85,98" fill={accent} fillOpacity="0.22" />
            <polygon points="115,85 160,58 175,88 130,112" fill={accent} fillOpacity="0.28" />
            <polygon points="90,115 130,95 142,122 102,138" fill={accent} fillOpacity="0.18" />
            <polygon points="150,100 185,82 195,106 160,122" fill={accent} fillOpacity="0.25" />
          </g>

          {/* 近景立体棱镜碎片（带高光边） */}
          <g opacity={isDark ? 0.95 : 0.85}>
            <polygon points="95,60 145,35 158,68 110,88" fill={accent} fillOpacity="0.45" stroke="#FFFFFF" strokeWidth="1" strokeOpacity="0.6" />
            <polygon points="105,75 152,48 140,85 92,105" fill={accent} fillOpacity="0.35" stroke={accent} strokeWidth="1.2" />
          </g>
        </svg>
      </div>
    );
  }

  if (style === 'beams') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
        <svg className="h-full w-full" viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="beamGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={accent} stopOpacity={isDark ? '0.65' : '0.4'} />
              <stop offset="45%" stopColor={accent} stopOpacity={isDark ? '0.35' : '0.2'} />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="beamGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={isDark ? '0.5' : '0.3'} />
              <stop offset="50%" stopColor={accent} stopOpacity={isDark ? '0.45' : '0.25'} />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 扫过画面的光束体 */}
          <polygon points="10,-20 80,-20 180,200 110,200" fill="url(#beamGrad1)" />
          <polygon points="65,-20 120,-20 230,200 175,200" fill="url(#beamGrad2)" />
          <polygon points="115,-20 160,-20 270,200 225,200" fill="url(#beamGrad1)" opacity="0.65" />
        </svg>
      </div>
    );
  }

  if (style === 'dots') {
    const dotColor = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
    const gridLine = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
        {/* 背景微网格 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${gridLine} 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* 精细坐标点阵 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${dotColor} 1.2px, transparent 1.2px)`,
            backgroundSize: '12px 12px',
          }}
        />

        {/* 中心微发光脉冲点 */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 240 180" aria-hidden="true">
          <circle cx="120" cy="90" r="3" fill={accent} style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
          <circle cx="72" cy="54" r="2.2" fill={accent} opacity="0.85" />
          <circle cx="168" cy="126" r="2.2" fill={accent} opacity="0.85" />
          <circle cx="180" cy="54" r="1.8" fill={accent} opacity="0.7" />
          <circle cx="60" cy="126" r="1.8" fill={accent} opacity="0.7" />
        </svg>
      </div>
    );
  }

  if (style === 'galaxy') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: isDark ? '#090B10' : '#EDF2FB' }}>
        {/* 中心星云弥散 */}
        <div
          className="absolute left-1/2 top-1/2 h-32 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(ellipse at center, ${accent} 0%, rgba(139, 92, 246, 0.4) 40%, transparent 75%)`,
            opacity: isDark ? 0.55 : 0.35,
          }}
        />

        {/* 纵深星尘与十字星芒 */}
        <svg className="h-full w-full" viewBox="0 0 240 180" aria-hidden="true">
          {/* 星野亮点 */}
          {[
            [35, 45, 1.2, 0.6],
            [60, 25, 1.8, 0.9],
            [90, 65, 1, 0.5],
            [110, 35, 2.2, 1],
            [140, 75, 1.2, 0.7],
            [165, 30, 1.6, 0.8],
            [195, 60, 1, 0.5],
            [215, 40, 2, 0.95],
            [45, 115, 1.4, 0.7],
            [80, 140, 2, 0.9],
            [115, 105, 1.2, 0.6],
            [150, 135, 1.8, 0.85],
            [185, 110, 1.3, 0.75],
            [205, 145, 1.5, 0.8],
            [130, 90, 2.8, 1],
          ].map(([cx, cy, r, op], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill={i % 3 === 0 ? '#FFFFFF' : accent} opacity={op} />
          ))}

          {/* 主十字星芒 */}
          <g stroke="#FFFFFF" strokeWidth="0.8" opacity="0.85">
            <line x1="130" y1="82" x2="130" y2="98" />
            <line x1="122" y1="90" x2="138" y2="90" />
          </g>
        </svg>
      </div>
    );
  }

  if (style === 'rays') {
    const gradId = 'rays-preview-grad';
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
        <div
          className="absolute left-1/2 top-0 h-20 w-14 -translate-x-1/2 rounded-full blur-2xl"
          style={{ background: accent, opacity: isDark ? 0.5 : 0.32 }}
        />
        <svg className="h-full w-full" viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={accent} stopOpacity={isDark ? '0.8' : '0.5'} />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points="108,0 120,0 70,180 8,180" fill={`url(#${gradId})`} opacity="0.7" />
          <polygon points="120,0 132,0 232,180 168,180" fill={`url(#${gradId})`} />
          <polygon points="116,0 124,0 136,180 104,180" fill="#ffffff" opacity={isDark ? 0.34 : 0.22} />
        </svg>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
      <svg className="h-full w-full" viewBox="0 0 240 180" aria-hidden="true">
        {/* 拓扑连线 */}
        <g stroke={accent} strokeWidth="1" strokeOpacity={isDark ? '0.35' : '0.25'}>
          <line x1="45" y1="60" x2="95" y2="40" />
          <line x1="95" y1="40" x2="155" y2="65" />
          <line x1="155" y1="65" x2="200" y2="45" />
          <line x1="95" y1="40" x2="115" y2="120" />
          <line x1="115" y1="120" x2="155" y2="65" />
          <line x1="115" y1="120" x2="70" y2="135" />
          <line x1="155" y1="65" x2="185" y2="130" />
          <line x1="185" y1="130" x2="200" y2="45" />
        </g>

        {/* 粒子节点（带外光圈） */}
        {[
          [45, 60, 2.5],
          [95, 40, 3],
          [155, 65, 3.5],
          [200, 45, 2.5],
          [70, 135, 2.5],
          [115, 120, 3],
          [185, 130, 2.8],
        ].map(([cx, cy, r], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r * 2} fill={accent} opacity={isDark ? 0.25 : 0.15} />
            <circle cx={cx} cy={cy} r={r} fill={accent} />
            <circle cx={cx} cy={cy} r={r * 0.5} fill="#FFFFFF" opacity="0.8" />
          </g>
        ))}
      </svg>
    </div>
  );
}
