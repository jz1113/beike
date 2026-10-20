import { useEffect, useId, type HTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { useMediaQuery } from '@client/shared/hooks/useMediaQuery';
import { beikePetMotion, type BeikePetPhase } from './beikeMotion';

interface Props {
  phase: BeikePetPhase;
  label: string;
  disabled?: boolean;
  onOpen: () => void;
  onFiles: (files: File[]) => void;
  onDragging?: (dragging: boolean) => void;
  moving?: boolean;
  size?: number;
  onContextMenu?: HTMLAttributes<HTMLButtonElement>['onContextMenu'];
  pointerProps?: Pick<HTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture' | 'onClickCapture'>;
  decorative?: boolean;
}

const bodyOrigin = { transformBox: 'view-box', transformOrigin: '60px 90px' } as const;
const eyeOrigin = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
const earOrigin = { transformBox: 'view-box', transformOrigin: '37px 46px' } as const;

export function BeikePet({ phase, label, disabled, onOpen, onFiles, onDragging, moving, size = 96, onContextMenu, pointerProps, decorative = false }: Props) {
  const id = useId();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const drop = useFileDropZone({ onFiles, disabled: disabled || decorative });
  useEffect(() => { onDragging?.(drop.isDragging); }, [drop.isDragging, onDragging]);
  const pose = beikePetMotion(phase, reduced);
  const paint = (name: string) => `url(#${id}-${name})`;
  const failed = phase === 'partial' || phase === 'error';

  const artwork = (
    <>
      <svg viewBox="0 0 120 120" className={`pointer-events-none h-full w-full overflow-visible group-focus-visible:drop-shadow-[0_0_3px_#8b5cf6] ${drop.isDragging ? 'drop-shadow-[0_0_6px_#a78bfa]' : ''}`} aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-skin`} cx="35%" cy="22%" r="85%">
            <stop stopColor="#eee4ff" />
            <stop offset="0.42" stopColor="#c6b0f5" />
            <stop offset="0.8" stopColor="#a084df" />
            <stop offset="1" stopColor="#8062be" />
          </radialGradient>
          <linearGradient id={`${id}-ear`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ddcaff" /><stop offset="1" stopColor="#9d7bd6" />
          </linearGradient>
          <radialGradient id={`${id}-belly`}>
            <stop stopColor="#f7eeff" stopOpacity="0.65" /><stop offset="1" stopColor="#e6d7ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-shadow`}>
            <stop stopColor="#6d45a2" stopOpacity="0.24" /><stop offset="1" stopColor="#6d45a2" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="108" rx="37" ry="7" fill={paint('shadow')} />
        <path d="M99 31V39M95 35H103" stroke="#b9a0e5" strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
        <circle cx="20" cy="76" r="2" fill="#cbb6ed" opacity="0.6" />
        <motion.g key={phase} animate={pose.feedback} style={bodyOrigin}>
          <motion.g animate={pose.body} style={bodyOrigin}>
            <motion.g
              style={bodyOrigin}
              variants={{ curious: { y: -3, rotate: -3, scale: 1.04 }, pressed: { y: 3, rotate: 0, scale: 0.94 } }}
              transition={{ type: 'spring', stiffness: 350, damping: 18 }}
            >
              <motion.g animate={pose.ears} style={earOrigin}>
                <path d="M34 49C21 40 20 23 27 22C34 21 42 35 43 45Z" fill={paint('ear')} stroke="#e9daff" strokeWidth="0.7" />
                <path d="M32 40C27 34 25 27 28 27C31 27 35 34 37 40Z" fill="#efcbe9" opacity="0.8" />
              </motion.g>
              <g transform="translate(120 0) scale(-1 1)">
                <motion.g animate={pose.ears} style={earOrigin}>
                  <path d="M34 49C21 40 20 23 27 22C34 21 42 35 43 45Z" fill={paint('ear')} stroke="#e9daff" strokeWidth="0.7" />
                  <path d="M32 40C27 34 25 27 28 27C31 27 35 34 37 40Z" fill="#efcbe9" opacity="0.8" />
                </motion.g>
              </g>
              <ellipse cx="43" cy="100" rx="11" ry="6" fill="#a48ad6" />
              <ellipse cx="77" cy="100" rx="11" ry="6" fill="#9679cd" />
              <path d="M31 51C33 36 44 30 60 31C76 30 87 36 89 51C94 61 98 76 92 88C87 100 74 103 60 103C46 103 33 100 28 88C22 76 26 61 31 51Z" fill={paint('skin')} stroke="#e9dcff" strokeOpacity="0.65" strokeWidth="0.8" />
              <ellipse cx="59" cy="86" rx="26" ry="15" fill={paint('belly')} />
              <path d="M39 43Q48 36 58 38" fill="none" stroke="#fff7ff" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
              <path d="M57 32Q60 25 64 31Q68 25 70 33" fill="none" stroke="#ddcaff" strokeWidth="3" strokeLinecap="round" />
              <path d="M30 73Q22 72 25 83Q27 89 32 85" fill="#b49ae8" stroke="#e3d1fa" strokeWidth="0.7" />
              <path d="M90 73Q98 72 95 83Q93 89 88 85" fill="#ab8fdf" stroke="#dbc5f5" strokeWidth="0.7" />
              <ellipse cx="39" cy="73" rx="7" ry="4" fill="#f1a9ce" opacity="0.6" />
              <ellipse cx="81" cy="73" rx="7" ry="4" fill="#f1a9ce" opacity="0.6" />
              {[47, 73].map((x) => (
                <motion.g key={x} animate={pose.eyes} style={eyeOrigin}>
                  <ellipse cx={x} cy="63" rx="6.7" ry={pose.eyeHeight + 1.5} fill="#eee4ff" opacity="0.55" />
                  <motion.g animate={pose.gaze}>
                    <ellipse cx={x} cy={pose.pupilY} rx="5.2" ry={pose.eyeHeight} fill="#352648" />
                    <ellipse cx={x + 1} cy={pose.pupilY + 3} rx="2.8" ry="2" fill="#80649f" opacity="0.55" />
                    <circle cx={x - 1.5} cy={pose.pupilY - 2.5} r="1.8" fill="#fff" />
                    <circle cx={x + 1.7} cy={pose.pupilY + 1.2} r="0.8" fill="#fff" opacity="0.8" />
                  </motion.g>
                </motion.g>
              ))}
              {failed && <path d="M42 52L50 54M70 54L78 52" stroke="#73518f" strokeWidth="1.7" strokeLinecap="round" />}
              <ellipse cx="60" cy="72" rx="2" ry="1.4" fill="#8e65a8" opacity="0.7" />
              <motion.g animate={pose.mouthMotion} style={eyeOrigin} data-part="mouth">
                <path d={pose.mouth} fill={pose.mouthOpen ? '#513355' : 'none'} stroke="#513355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {pose.mouthOpen && <path d="M56 82Q60 79 64 82Q60 87 56 82" fill="#eea6c5" />}
              </motion.g>
            </motion.g>
          </motion.g>
        </motion.g>
      </svg>
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 right-0 flex items-center gap-1 rounded-full border border-violet-200/80 bg-white/95 px-2 py-1 text-[10px] font-semibold leading-none text-violet-700 shadow-[0_2px_8px_#5b348214] dark:border-violet-300/15 dark:bg-[#292136] dark:text-violet-200">
        <span className={`h-1 w-1 rounded-full ${failed ? 'bg-amber-400' : 'bg-violet-400'}`} />{pose.badge}
      </span>
    </>
  );
  const cursor = moving ? 'cursor-grabbing' : 'cursor-grab';
  const frameClass = `group relative isolate touch-none select-none border-0 bg-transparent p-0 focus-visible:outline-none ${decorative ? '' : cursor}`;
  const frameStyle = { width: size, height: size };
  if (decorative) {
    return <motion.div aria-hidden data-phase={phase} style={frameStyle} className={frameClass}>{artwork}</motion.div>;
  }
  return (
    <motion.button
      type="button"
      {...drop.dropZoneProps}
      {...pointerProps}
      onContextMenu={onContextMenu}
      onClick={onOpen}
      aria-label={label}
      data-phase={phase}
      whileHover={reduced ? undefined : 'curious'}
      whileFocus={reduced ? undefined : 'curious'}
      whileTap={reduced ? undefined : 'pressed'}
      style={frameStyle}
      className={frameClass}
    >
      {artwork}
    </motion.button>
  );
}
