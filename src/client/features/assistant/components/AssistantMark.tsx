/** Reuse the app’s brand asset across the assistant surfaces. */
export default function AssistantMark({ className = '' }: { className?: string }) {
  return <img className={`agent-brand-logo ${className}`} src="/app_logo.png" alt="" aria-hidden="true" draggable={false} />;
}
