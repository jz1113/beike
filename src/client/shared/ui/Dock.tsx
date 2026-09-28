'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence
} from 'motion/react';
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
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
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={() => { if (!disabled) onClick?.(); }}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex items-center justify-center rounded-xl border border-[#3a3540] bg-[#201d25] text-slate-100 shadow-sm transition-colors ${disabled ? 'cursor-not-allowed text-slate-400 opacity-70' : 'cursor-pointer hover:border-[#554e5c] hover:bg-[#29252f]'} ${className}`}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-disabled={disabled}
      aria-label={typeof label === 'string' ? label : undefined}
    >
      {Children.map(children, child =>
        React.isValidElement(child)
          ? cloneElement(child as React.ReactElement<{ isHovered?: MotionValue<number> }>, { isHovered })
          : child
      )}
    </motion.div>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
  placement?: 'top' | 'bottom';
};

function DockLabel({
  children,
  className = '',
  isHovered,
  placement = 'top',
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
        <motion.div
          initial={{ opacity: 0, y: isBottom ? -4 : 0 }}
          animate={{ opacity: 1, y: isBottom ? 2 : -10 }}
          exit={{ opacity: 0, y: isBottom ? -4 : 0 }}
          transition={{ duration: 0.2 }}
          className={`${className} absolute ${isBottom
            ? 'top-[calc(100%+8px)] text-[11px] font-medium leading-none text-slate-500'
            : '-top-6 rounded-md border border-[#3a3540] bg-[#201d25] px-2 py-0.5 text-xs text-white shadow-lg'} left-1/2 w-fit whitespace-pre`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
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
  return <div className={`flex items-center justify-center ${className}`}>{children}</div>;
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

  const maxHeight = useMemo(() => expandsOnHover ? Math.max(dockHeight, magnification + magnification / 2 + 4) : panelHeight, [dockHeight, expandsOnHover, magnification, panelHeight]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div style={{ height, scrollbarWidth: 'none' }} className="flex max-w-full items-center">
      <motion.div
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
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
            key={index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
            label={item.label}
            disabled={item.disabled}
          >
            <DockIcon>{item.icon}</DockIcon>
            {showLabels && <DockLabel placement={labelPlacement}>{item.label}</DockLabel>}
          </DockItem>
        ))}
      </motion.div>
    </motion.div>
  );
}
