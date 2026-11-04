import GlideSelect from '@client/shared/ui/GlideSelect';

export interface DropdownOption<T extends string> {
  id: T;
  label: string;
}

export interface MaterialFilterDropdownProps<T extends string> {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (val: T) => void;
  align?: 'left' | 'right';
}

export default function MaterialFilterDropdown<T extends string>({
  label, value, options, onChange, align = 'right',
}: MaterialFilterDropdownProps<T>) {
  return (
    <GlideSelect ariaLabel={label} value={value} align={align} size="sm" menuWidth={140}
      options={options.map(option => ({ value: option.id, label: option.label }))}
      onChange={next => {
        const selected = options.find(option => option.id === next);
        if (selected) onChange(selected.id);
      }}
    />
  );
}
