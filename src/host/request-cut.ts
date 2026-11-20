import type { EditEvents, HostAgent, RequestPosition, SessionEvent, UserMessage } from './types.js';

/** Queue a resend under maintenance, then cut in the open step that claims it. */
export function deferCut(
  events: EditEvents,
  agent: HostAgent,
  message: UserMessage,
  append: (position: RequestPosition) => SessionEvent,
  flush: () => Promise<void>,
  signal?: AbortSignal,
) {
  let resolve!: (marker: SessionEvent) => void;
  let reject!: (error: unknown) => void;
  const completion = new Promise<SessionEvent>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  // The driver may fail before the caller leaves maintenance and awaits this.
  void completion.catch(() => {});
  let claimedTurn: number | undefined;
  let marker: SessionEvent | undefined;
  let failure: Error | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopClaim = events.on('agent/inbox/claimed', input => {
    if (input.agent === agent && input.message.id === message.id) claimedTurn = input.turn;
  });
  const stopRequest = events.on('agent/request', async (position, next) => {
    if (position.agent !== agent || claimedTurn !== position.turn || position.step !== 1 || marker) return next();
    try {
      const config = await next();
      if (failure) throw failure;
      position.signal.throwIfAborted();
      signal?.throwIfAborted();
      marker = append(position);
      clearTimeout(timer);
      await flush();
      resolve(marker);
      return config;
    } catch (error) {
      reject(error);
      throw error; // Never generate with the old history if the cut failed.
    }
  });

  function fail(error: Error, cancelClaimed: boolean): void {
    if (marker || failure) return;
    failure = error;
    try {
      if (!agent.inbox.remove(message.id) && cancelClaimed && claimedTurn !== undefined) {
        agent.cancel({ kind: 'user' }, { keepInbox: true });
      }
      reject(error);
    } catch (cause) {
      reject(new AggregateError([error, cause], `${error.message} Could not remove the queued edit.`));
    }
  }
  const noRequest = () => new Error('重新生成未开始。 / The replacement request did not start.');
  const abort = () => fail(new Error('消息编辑已取消。 / Message edit was canceled.'), true);
  const dispose = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    stopRequest();
    stopClaim();
  };

  return {
    get marker() { return marker; },
    dispose,
    async wait(): Promise<SessionEvent> {
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      if (!marker && !failure) {
        timer = setTimeout(() => fail(noRequest(), true), 30_000);
        timer.unref();
      }
      void agent.whenIdle().then(() => fail(noRequest(), false), () => fail(noRequest(), false));
      return completion;
    },
  };
}
