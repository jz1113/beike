import React from 'react';

type GridCols = '2' | '2-4';

interface Props {
  children: React.ReactNode;
  cols?: GridCols;
  className?: string;
}

const COL_CLASSES: Record<GridCols, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '2-4': 'grid-cols-2 lg:grid-cols-4',
};

export default function BatchShotGrid({ children, cols = '2', className = '' }: Props) {
  return (
    <div className={`grid ${COL_CLASSES[cols]} ${className}`}>
      {children}
    </div>
  );
}
