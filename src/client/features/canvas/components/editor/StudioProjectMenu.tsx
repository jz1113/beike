import { CanvasSaveStatus } from '../projects/CanvasSaveStatus';

/** Saving stays automatic; only failures need space over the canvas. */
export function StudioProjectMenu() {
  return <div className="pointer-events-none absolute bottom-14 left-3 right-3 z-30 flex justify-start [&>*]:pointer-events-auto">
    <CanvasSaveStatus failuresOnly />
  </div>;
}
