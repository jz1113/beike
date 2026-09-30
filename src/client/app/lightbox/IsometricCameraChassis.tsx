import type React from 'react';

/** 🌟 3D 拟物立体白色摄像机器组件 (完全对齐图 2：圆润白色倒角立方体机身、立体阴影切面、顶面高光与实时取景液晶屏) */
interface IsometricCameraChassisProps {
  imgSrc: string;
  hasError: boolean;
  azimuth: number;
  elevation: number;
}

export const IsometricCameraChassis: React.FC<IsometricCameraChassisProps> = ({
  imgSrc,
  hasError,
  azimuth,
  elevation,
}) => {
  // 当摄像机在球体右侧时，水平翻转机身，使摄像机镜头始终朝向中心主图
  const isRightSide = azimuth > 0 && azimuth < 180;

  return (
    <div
      className="relative select-none pointer-events-none transition-all duration-300 ease-out"
      style={{
        transform: `scale(${isRightSide ? '-1, 1' : '1, 1'})`,
      }}
      title={`摄像机方位: 水平 ${azimuth}°, 垂直 ${elevation}°`}
    >
      <div className="relative w-[68px] h-[58px] filter drop-shadow-[0_12px_22px_rgba(15,23,42,0.18)] drop-shadow-[0_3px_6px_rgba(15,23,42,0.08)]">
        <svg viewBox="0 0 76 66" className="w-full h-full">
          <defs>
            {/* 顶面洁白高光受光面渐变 */}
            <linearGradient id="camTopGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="70%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>

            {/* 右侧面立体厚度渐变 (银白至阴影灰过渡) */}
            <linearGradient id="camRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E5EAEF" />
              <stop offset="50%" stopColor="#D4DBE6" />
              <stop offset="100%" stopColor="#BAC3D2" />
            </linearGradient>

            {/* 底面背光立体阴影切面渐变 */}
            <linearGradient id="camBottomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#CBD4E2" />
              <stop offset="100%" stopColor="#9AA6B8" />
            </linearGradient>

            {/* 正面机身白瓷质感渐变 */}
            <linearGradient id="camFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="70%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#EDF2F7" />
            </linearGradient>

            {/* 屏幕玻璃高反光斜向渐变 (图2标志性的白亮高光) */}
            <linearGradient id="camGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.72)" />
              <stop offset="30%" stopColor="rgba(255, 255, 255, 0.22)" />
              <stop offset="32%" stopColor="rgba(255, 255, 255, 0.0)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.1)" />
            </linearGradient>

            {/* 屏幕圆角裁切区域 */}
            <clipPath id="cameraScreenClip">
              <rect x="9" y="16.5" width="28" height="21" rx="4.5" transform="rotate(-7 23 27)" />
            </clipPath>
          </defs>

          {/* 1. 3D 底面厚度切角 (向右下方自然延伸) */}
          <path
            d="M 12 43 C 9 45.5 13 47.5 16 48.5 L 50 53 C 54 53.5 56 51 56 47 L 56 34 L 12 40 Z"
            fill="url(#camBottomGrad)"
          />

          {/* 2. 3D 右侧成立体厚度切面 (平滑圆润柱状过渡) */}
          <path
            d="M 45 13.5 C 49 13 54 16 57 19.5 L 63 35 C 65 39.5 62 44 58 47 L 47 52.5 C 44 53.5 45 50 45 46 L 45 19 C 45 15.5 44 14 45 13.5 Z"
            fill="url(#camRightGrad)"
          />

          {/* 3. 3D 顶面受光面 (洁白无瑕，向右上方后退) */}
          <path
            d="M 13 14 C 10 12 14 10 17 9.5 L 42 4.5 C 47 3.5 51 5.5 54 8 L 60 19 C 55 16 50 13.5 45 13.8 L 13 17.5 C 9.5 16.5 11 15 13 14 Z"
            fill="url(#camTopGrad)"
          />

          {/* 4. 正面圆润白瓷机壳 (前置微透视角度) */}
          <rect
            x="6"
            y="12"
            width="38"
            height="30"
            rx="8"
            fill="url(#camFrontGrad)"
            stroke="#E2E7F0"
            strokeWidth="0.8"
            transform="rotate(-7 25 27)"
          />

          {/* 5. 屏幕内嵌黑色金属边框 */}
          <rect
            x="8.5"
            y="16"
            width="29"
            height="22"
            rx="5"
            fill="#090D17"
            stroke="#1E293B"
            strokeWidth="0.6"
            transform="rotate(-7 23 27)"
          />

          {/* 6. 屏幕取景原图 (实时同步缩略画面) */}
          <g clipPath="url(#cameraScreenClip)">
            {!hasError && imgSrc ? (
              <image
                href={imgSrc}
                x="7"
                y="14"
                width="32"
                height="25"
                preserveAspectRatio="xMidYMid slice"
                transform="rotate(-7 23 27)"
              />
            ) : (
              <rect x="0" y="0" width="76" height="66" fill="#0F172A" />
            )}
          </g>

          {/* 7. 屏幕玻璃斜角高反光镜面 */}
          <rect
            x="9"
            y="16.5"
            width="28"
            height="21"
            rx="4.5"
            fill="url(#camGlassGrad)"
            pointerEvents="none"
            transform="rotate(-7 23 27)"
          />

          {/* 8. 摄像机微型十字取景标线与状态红点 */}
          <g transform="rotate(-7 23 27)" opacity="0.45" stroke="#FFFFFF" strokeWidth="0.6">
            <line x1="19" y1="27" x2="27" y2="27" />
            <line x1="23" y1="23" x2="23" y2="31" />
          </g>
          <circle cx="34" cy="19" r="0.85" fill="#EF4444" transform="rotate(-7 23 27)" />
        </svg>
      </div>
    </div>
  );
};

