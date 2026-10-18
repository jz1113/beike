'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence
} from 'motion/react';
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';

export type DockItemData = {
  id?: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  active?: boolean;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  positioned?: boolean;
  expandsOnHover?: boolean;
  showLabels?: boolean;
  labelPlacement?: 'top' | 'bottom';
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  label?: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  reducedMotion: boolean;
};

function DockItem({
  children,
  className = '',
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
  label,
  disabled = false,
  active = false,
  reducedMotion,
}: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const isHovered = useMotionValue(0);
  const isKeyboardFocused = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize
    };
    return val - rect.x - baseItemSize / 2;
  });

  const pointerSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const targetSize = useTransform<number, number>([pointerSize, isKeyboardFocused], ([pointerValue, focused]) => focused ? magnification : pointerValue);
  const size = useSpring(targetSize, spring);

  return (
    <motion.button
      ref={ref}
      type="button"
      style={{
        width: reducedMotion ? baseItemSize : size,
        height: reducedMotion ? baseItemSize : size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={event => {
        isHovered.set(1);
        isKeyboardFocused.set(event.currentTarget.matches(':focus-visible') ? 1 : 0);
      }}
      onBlur={() => {
        isHovered.set(0);
        isKeyboardFocused.set(0);
      }}
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl border border-[#3a3540] bg-[#201d25] text-slate-100 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${disabled ? 'cursor-not-allowed text-slate-400 opacity-70' : 'cursor-pointer hover:border-[#554e5c] hover:bg-[#29252f]'} ${className}`}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      aria-label={typeof label === 'string' ? label : undefined}
    >
      {Children.map(children, child =>
        React.isValidElement(child)
          ? cloneElement(child as React.ReactElement<{ isHovered?: MotionValue<number> }>, { isHovered })
          : child
      )}
    </motion.button>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
  placement?: 'top' | 'bottom';
  reducedMotion: boolean;
};

function DockLabel({
  children,
  className = '',
  isHovered,
  placement = 'top',
  reducedMotion,
}: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const isBottom = placement === 'bottom';

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', latest => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.span
          initial={reducedMotion ? false : { opacity: 0, y: isBottom ? -4 : 0 }}
          animate={{ opacity: 1, y: isBottom ? 2 : -10 }}
          exit={{ opacity: 0, y: isBottom ? -4 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
          className={`${className} absolute ${isBottom
            ? 'top-[calc(100%+8px)] text-[11px] font-medium leading-none text-slate-500 dark:text-slate-400'
            : '-top-6 rounded-md border border-[#3a3540] bg-[#201d25] px-2 py-0.5 text-xs text-white shadow-lg'} left-1/2 w-fit whitespace-pre`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockIcon({ children, className = '' }: DockIconProps) {
  return <span className={`flex items-center justify-center ${className}`}>{children}</span>;
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 70,
  distance = 200,
  panelHeight = 68,
  dockHeight = 256,
  baseItemSize = 50,
  positioned = true,
  expandsOnHover = true,
  showLabels = true,
  labelPlacement = 'top',
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const reducedMotion = useReducedMotion() === true;

  const maxHeight = useMemo(() => expandsOnHover ? Math.max(dockHeight, magnification + magnification / 2 + 4) : panelHeight, [dockHeight, expandsOnHover, magnification, panelHeight]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div style={{ height: reducedMotion ? panelHeight : height, scrollbarWidth: 'none' }} className="flex max-w-full items-center">
      <motion.div
        onMouseMove={({ clientX }) => {
          isHovered.set(1);
          mouseX.set(clientX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={`${className} ${positioned ? 'absolute bottom-2 left-1/2 -translate-x-1/2' : 'relative'} flex w-fit items-end gap-1.5 rounded-xl border border-[#393440] bg-[#18151d] p-1.5`}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label="Application dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={item.id ?? index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
            label={item.label}
            disabled={item.disabled}
            active={item.active}
            reducedMotion={reducedMotion}
          >
            <DockIcon>{item.icon}</DockIcon>
            {showLabels && <DockLabel placement={labelPlacement} reducedMotion={reducedMotion}>{item.label}</DockLabel>}
          </DockItem>
        ))}
      </motion.div>
    </motion.div>
  );
}
