import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';

const MAX_OVERFLOW = 50;

interface ElasticSliderProps {
  value?: number;
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onValueChange?: (value: number) => void;
  tone?: 'dark' | 'light';
}

const ElasticSlider: React.FC<ElasticSliderProps> = ({
  value,
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = <>-</>,
  rightIcon = <>+</>,
  onValueChange,
  tone = 'dark',
}) => {
  return (
    <div className={`flex w-full flex-col items-center justify-center ${className}`}>
      <Slider
        value={value}
        defaultValue={defaultValue}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        onValueChange={onValueChange}
        tone={tone}
      />
    </div>
  );
};

interface SliderProps {
  value?: number;
  defaultValue: number;
  startingValue: number;
  maxValue: number;
  isStepped: boolean;
  stepSize: number;
  leftIcon: React.ReactNode;
  rightIcon: React.ReactNode;
  onValueChange?: (value: number) => void;
  tone: 'dark' | 'light';
}

const Slider: React.FC<SliderProps> = ({
  value,
  defaultValue,
  startingValue,
  maxValue,
  isStepped,
  stepSize,
  leftIcon,
  rightIcon,
  onValueChange,
  tone,
}) => {
  const [uncontrolledValue, setUncontrolledValue] = useState<number>(defaultValue);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);
  const currentValue = value ?? uncontrolledValue;

  useEffect(() => {
    if (value === undefined) setUncontrolledValue(defaultValue);
  }, [defaultValue, value]);

  const updateValue = (nextValue: number) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  useMotionValueEvent(clientX, 'change', (latest: number) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;
      if (latest < left) {
        setRegion('left');
        newValue = left - latest;
      } else if (latest > right) {
        setRegion('right');
        newValue = latest - right;
      } else {
        setRegion('middle');
        newValue = 0;
      }
      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0 && sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);
      if (isStepped) {
        newValue = Math.round(newValue / stepSize) * stepSize;
      }
      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      updateValue(newValue);
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  const getRangePercentage = (): number => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((currentValue - startingValue) / totalRange) * 100;
  };

  return (
    <>
      <motion.div
        onHoverStart={() => animate(scale, 1.08)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.08)}
        onTouchEnd={() => animate(scale, 1)}
        style={{
          scale,
          opacity: useTransform(scale, [1, 1.08], [0.88, 1])
        }}
        className="flex w-full touch-none select-none items-center justify-center gap-2"
      >
        <motion.div
          animate={{
            scale: region === 'left' ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 }
          }}
          style={{
            x: useTransform(() => (region === 'left' ? -overflow.get() / scale.get() : 0))
          }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="relative flex w-full max-w-none flex-grow cursor-grab touch-none select-none items-center py-2"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  return 1 + overflow.get() / width;
                }
                return 1;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? 'right' : 'left';
                }
                return 'center';
              }),
              height: useTransform(scale, [1, 1.08], [3, 5]),
              marginTop: useTransform(scale, [1, 1.08], [0, -1]),
              marginBottom: useTransform(scale, [1, 1.08], [0, -1])
            }}
            className="flex flex-grow"
          >
            <div
              className={`relative h-full flex-grow overflow-visible rounded-full ${tone === 'light' ? 'bg-slate-100 dark:bg-white/10' : 'bg-[#17151b]'}`}
              style={{ backgroundImage: tone === 'light' ? 'repeating-linear-gradient(90deg, transparent 0, transparent 15px, rgba(148, 163, 184, 0.62) 15px, rgba(148, 163, 184, 0.62) 16px)' : 'repeating-linear-gradient(90deg, transparent 0, transparent 15px, rgba(117, 109, 130, 0.42) 15px, rgba(117, 109, 130, 0.42) 16px)' }}
            >
              <div className={`absolute h-full rounded-full ${tone === 'light' ? 'bg-slate-300' : 'bg-[#4a4650]'}`} style={{ width: `${getRangePercentage()}%` }} />
              <div className={`absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1px_rgba(15,23,42,0.12)] ${tone === 'light' ? 'bg-slate-500' : 'bg-[#a19ca8]'}`} style={{ left: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: region === 'right' ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 }
          }}
          style={{
            x: useTransform(() => (region === 'right' ? overflow.get() / scale.get() : 0))
          }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>
    </>
  );
};

function decay(value: number, max: number): number {
  if (max === 0) {
    return 0;
  }
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

export default ElasticSlider;
