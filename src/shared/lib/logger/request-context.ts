import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  reqId: string;
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `callback` with a request-scoped context. Everything awaited inside —
 * controllers, services, MIS calls — sees the same `reqId` through `getRequestContext()`,
 * so the logger can correlate all of it without threading a logger through call signatures.
 */
export const runWithRequestContext = <T>(context: RequestContext, callback: () => T): T =>
  storage.run(context, callback);

export const getRequestContext = (): RequestContext | undefined => storage.getStore();

/** Called by the auth middleware once the bearer token has been resolved to a user. */
export const setRequestContextUser = (userId: string, role?: string) => {
  const store = storage.getStore();

  if (!store) return;

  store.userId = userId;

  if (role) {
    store.role = role;
  }
};
