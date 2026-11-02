import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { salesFocusClass } from './salesChrome';

export function SalesSettingsChoice({ icon, title, description, selected, disabled, badge, onSelect }: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  badge?: string;
  onSelect: () => void;
}) {
  const descriptionId = useId();
  return <button type="button" className={`sales-settings-choice ${salesFocusClass}`}
    aria-label={title} aria-describedby={descriptionId} aria-pressed={selected} disabled={disabled} onClick={onSelect}>
    <span className="sales-settings-choice-heading">
      {icon}<strong>{title}</strong>
      <span className="sales-settings-choice-check" aria-hidden>{selected && <Check size={11} />}</span>
    </span>
    <span id={descriptionId} className="sales-settings-choice-description">{description}</span>
    {badge && <span className="sales-settings-choice-badge">{badge}</span>}
  </button>;
}
