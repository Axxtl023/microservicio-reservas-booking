import { AsyncLocalStorage } from 'async_hooks';

export interface TraceInfo {
  correlationId?: string;
}

export const traceLocalStorage = new AsyncLocalStorage<TraceInfo>();

export function getCorrelationId(): string | undefined {
  return traceLocalStorage.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return traceLocalStorage.run({ correlationId }, fn);
}
