import { randomUUID } from 'crypto';

export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  correlationId: string;
  causationId?: string;
  source: string;
  timestamp: string;
  payload: TPayload;
}

export interface WrapOptions {
  correlationId: string;
  causationId?: string;
  source?: string;
  eventVersion?: string;
}

const DEFAULT_SOURCE = 'reservas-booking';
const DEFAULT_VERSION = '1.0.0';

export function wrap<T>(
  eventType: string,
  payload: T,
  opts: WrapOptions,
): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: opts.eventVersion ?? DEFAULT_VERSION,
    correlationId: opts.correlationId,
    causationId: opts.causationId,
    source: opts.source ?? DEFAULT_SOURCE,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function isValidEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eventId === 'string' &&
    typeof v.eventType === 'string' &&
    typeof v.correlationId === 'string' &&
    typeof v.source === 'string' &&
    typeof v.timestamp === 'string' &&
    'payload' in v
  );
}
