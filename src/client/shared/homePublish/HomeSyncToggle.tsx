import { useState } from 'react';
import { readHomeSync, writeHomeSync } from './homePublish';

export function HomeSyncToggle() {
  const [enabled, setEnabled] = useState(readHomeSync);

  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-slate-500 select-none">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          writeHomeSync(event.target.checked);
          setEnabled(event.target.checked);
        }}
        className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
      />
      同步到首页
    </label>
  );
}
