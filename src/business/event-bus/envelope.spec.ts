import { wrap, isValidEnvelope } from './envelope';

describe('envelope', () => {
  describe('isValidEnvelope', () => {
    const base = {
      eventId: 'evt-1',
      eventType: 'payment.processed',
      eventVersion: '1.0.0',
      correlationId: 'corr-1',
      source: 'identidad-finanzas',
      timestamp: new Date().toISOString(),
      payload: { reservaId: 'res-1' },
    };

    it('returns true for a valid envelope', () => {
      expect(isValidEnvelope(base)).toBe(true);
    });

    it('returns true when causationId is absent (optional)', () => {
      const { ...without } = base;
      expect(isValidEnvelope(without)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidEnvelope(null)).toBe(false);
    });

    it('returns false for a non-object', () => {
      expect(isValidEnvelope('string')).toBe(false);
      expect(isValidEnvelope(42)).toBe(false);
    });

    it('returns false when eventId is missing', () => {
      const { eventId: _, ...rest } = base;
      expect(isValidEnvelope(rest)).toBe(false);
    });

    it('returns false when correlationId is missing', () => {
      const { correlationId: _, ...rest } = base;
      expect(isValidEnvelope(rest)).toBe(false);
    });

    it('returns false when payload is absent entirely', () => {
      const { payload: _, ...rest } = base;
      expect(isValidEnvelope(rest)).toBe(false);
    });

    it('returns true when payload is null (only checks key presence)', () => {
      expect(isValidEnvelope({ ...base, payload: null })).toBe(true);
    });
  });

  describe('wrap', () => {
    it('generates a valid envelope with a new UUID each call', () => {
      const a = wrap('test.event', { foo: 1 }, { correlationId: 'corr-1' });
      const b = wrap('test.event', { foo: 1 }, { correlationId: 'corr-1' });
      expect(a.eventId).not.toBe(b.eventId);
      expect(isValidEnvelope(a)).toBe(true);
    });

    it('forwards correlationId and optional causationId', () => {
      const env = wrap('test.event', {}, { correlationId: 'corr-x', causationId: 'evt-prev' });
      expect(env.correlationId).toBe('corr-x');
      expect(env.causationId).toBe('evt-prev');
    });

    it('defaults source to reservas-booking', () => {
      const env = wrap('test.event', {}, { correlationId: 'c' });
      expect(env.source).toBe('reservas-booking');
    });

    it('uses custom source when provided', () => {
      const env = wrap('test.event', {}, { correlationId: 'c', source: 'custom-src' });
      expect(env.source).toBe('custom-src');
    });

    it('sets timestamp as ISO string', () => {
      const env = wrap('test.event', {}, { correlationId: 'c' });
      expect(() => new Date(env.timestamp)).not.toThrow();
      expect(new Date(env.timestamp).toISOString()).toBe(env.timestamp);
    });
  });
});
