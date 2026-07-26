import React from "react";

interface Props {
  children: React.ReactNode;
  /** Shown in the heading, e.g. "Stats". Omit for the whole app. */
  label?: string;
  /** When true, offers the data-recovery escape hatches. Root boundary only. */
  root?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle throws so one bad component can't blank the whole
 * app. This matters more than usual here: the service worker serves a cached
 * shell, so a white screen survives reloads and looks like permanent data loss
 * even though IndexedDB is untouched. The root boundary says so explicitly and
 * offers a way out that doesn't involve wiping anything.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Render error caught by boundary:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  private hardReload = async () => {
    // Drop the cached shell too — a stale bundle is a common cause of a crash
    // that survives a plain refresh.
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* best effort — reload regardless */
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label, root } = this.props;

    if (!root) {
      return (
        <div className="m-4 rounded-2xl bg-ink2 border border-red-500/25 p-6 text-center">
          <h2 className="text-base font-bold text-white mb-1.5">
            {label ? `${label} couldn't load` : "This section couldn't load"}
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            The rest of Orbit is fine, and your data is untouched.
          </p>
          <button
            onClick={this.reset}
            className="px-5 py-2.5 rounded-xl bg-orange-500 text-ink font-bold text-sm hover:brightness-105"
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[200] overflow-y-auto bg-ink text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-ink2 border border-white/10 rounded-3xl p-7">
          <div className="w-9 h-9 rounded-xl bg-orange-500 text-ink font-display flex items-center justify-center text-lg mb-5">
            O
          </div>
          <h1 className="text-2xl font-bold mb-2">Orbit hit an error</h1>
          <p className="text-sm text-zinc-400 leading-relaxed mb-5">
            Something crashed while rendering.{" "}
            <b className="text-zinc-200">Your data is safe</b> — it lives in this
            browser's database and nothing here touches it.
          </p>

          <div className="space-y-2">
            <button
              onClick={this.reset}
              className="w-full py-3 bg-orange-500 text-ink font-bold text-sm rounded-2xl hover:brightness-105"
            >
              Try again
            </button>
            <button
              onClick={this.hardReload}
              className="w-full py-3 bg-ink3 border border-white/10 text-white font-bold text-sm rounded-2xl hover:border-white/25"
            >
              Reload with a fresh copy of the app
            </button>
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
              Error details
            </summary>
            <pre className="mt-2.5 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-words">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
