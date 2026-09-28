
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

interface Props {
  children: ReactNode;
  title?: string;
  resetLabel?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: formatUserError(error, '未知错误') };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[AppErrorBoundary]', error?.message, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const title = this.props.title || '页面遇到异常';
      const resetLabel = this.props.resetLabel || '刷新重试';
      return (
        <div className="flex-1 flex items-center justify-center bg-[#F8F9FA] p-8">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <h1 className="text-base font-bold text-slate-800">{title}</h1>
            <p className="mt-2 text-sm text-slate-500 break-words">{this.state.message}</p>
            <div className="mt-4 flex flex-col gap-2">
              {this.props.onReset ? (
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold cursor-pointer"
                  onClick={() => {
                    this.setState({ hasError: false, message: '' });
                    this.props.onReset?.();
                  }}
                >
                  {resetLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold cursor-pointer"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  if (typeof window !== 'undefined') window.location.reload();
                }}
              >
                刷新重试
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
