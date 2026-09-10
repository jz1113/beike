// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FeatureCapsules from '../components/FeatureCapsules';

describe('FeatureCapsules layout tests', () => {
  it('renders FeatureCapsules container with w-full and without max-w-5xl constraint', () => {
    const { container } = render(
      <FeatureCapsules
        onEnterWorkshop={vi.fn()}
        onEnterReplication={vi.fn()}
        onOpenCollectorHub={vi.fn()}
      />
    );

    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv.className).toContain('w-full');
    expect(rootDiv.className).not.toContain('max-w-5xl');
    expect(rootDiv.className).not.toContain('max-w-6xl');
  });

  it('renders capsule grid spanning full width with 3 items', () => {
    const { container } = render(
      <FeatureCapsules
        onEnterWorkshop={vi.fn()}
        onEnterReplication={vi.fn()}
        onOpenCollectorHub={vi.fn()}
      />
    );

    const gridDiv = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(gridDiv).toBeTruthy();
    expect(gridDiv.className).toContain('grid-cols-3');
  });
});
