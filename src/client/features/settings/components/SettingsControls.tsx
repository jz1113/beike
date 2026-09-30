import { createContext, useContext, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Activity, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { ExternalLinkAnchor } from '@client/shared/ui/ExternalLinkAnchor';

export const SettingsSaveContext = createContext(false);

export const SettingsConnectionContext = createContext<ReactNode>(null);

export function SettingsServiceHeader({ icon, title, description, links, action, actions }: {
  icon: ReactNode; title: string; description: string;
  links?: { label: string; href: string }[]; action?: ReactNode; actions?: ReactNode;
}) {
  const status = useContext(SettingsConnectionContext);
  return <header className="settings-service-header">
    <div className="settings-service-identity"><span className="settings-service-icon">{icon}</span><div><div className="settings-service-title"><h2>{title}</h2>{status}</div><p>{description}</p></div></div>
    <div className="settings-service-tools"><div className="settings-service-links">{links?.map(link => <ExternalLinkAnchor key={link.href} href={link.href}>{link.label}<ExternalLink className="h-3 w-3" /></ExternalLinkAnchor>)}{action}</div>{actions}</div>
  </header>;
}

export function SettingsField({ label, hint, id, ...input }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return <div className="settings-form-field"><label htmlFor={id}>{label}</label><input {...input} id={id} className="settings-field w-full" />{hint && <p>{hint}</p>}</div>;
}

export function SettingsSecretField({ label, id, visible, onVisibleChange, ...input }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; visible?: boolean; onVisibleChange?: (value: boolean) => void }) {
  const [localVisible, setLocalVisible] = useState(false);
  const shown = visible ?? localVisible;
  return <div className="settings-form-field"><label htmlFor={id}>{label}</label><div className="relative"><input {...input} id={id} type={shown ? 'text' : 'password'} autoComplete="off" spellCheck={false} className="settings-field w-full pr-11" /><button type="button" aria-label={`${shown ? '隐藏' : '显示'}${label}`} aria-pressed={shown} onClick={() => (onVisibleChange ?? setLocalVisible)(!shown)} className="settings-secret-reveal">{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>;
}

export function SettingsActions({ onTest, onSave, testing, testDisabled, disabled, testLabel = '测试连接' }: { onTest: () => void; onSave: () => void; testing: boolean; testDisabled?: boolean; disabled?: boolean; testLabel?: string }) {
  const saving = useContext(SettingsSaveContext);
  return <div className="settings-form-actions"><button type="button" onClick={onTest} disabled={testing || testDisabled || saving || disabled} className="settings-button-secondary">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}{testing ? '测试中…' : testLabel}</button><button type="submit" onClick={onSave} disabled={saving || disabled} aria-busy={saving} className="settings-button-primary">{saving ? '正在保存…' : '保存配置'}</button></div>;
}

export function SettingsToggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="settings-toggle"><span>{checked ? '已启用' : '未启用'}</span><span className={`settings-toggle-track ${checked ? 'is-on' : ''}`} aria-hidden="true"><span /></span></button>;
}
