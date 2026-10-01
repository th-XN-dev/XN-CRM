/**
 * Where "something new arrived" comes from. Today: polling the unread count
 * (cheap, served by a partial index). Tomorrow: a WebSocket/SSE channel with
 * the same interface — nothing that consumes it has to change.
 */
export interface NotificationChannel {
  /** Called with the current unread count whenever it may have changed; returns unsubscribe. */
  subscribe(listener: (unread: number) => void): () => void;
}

/**
 * Polls while the tab is visible (a hidden tab costs nothing) and immediately
 * when it becomes visible again.
 */
export function createPollingChannel(fetchUnread: () => Promise<number>, intervalMs: number): NotificationChannel {
  return {
    subscribe(listener) {
      let timer: ReturnType<typeof setInterval> | undefined;
      const tick = () => {
        if (document.visibilityState === 'visible') fetchUnread().then(listener, () => undefined);
      };
      const onVisibility = () => document.visibilityState === 'visible' && tick();
      tick();
      timer = setInterval(tick, intervalMs);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        clearInterval(timer);
        timer = undefined;
        document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}
