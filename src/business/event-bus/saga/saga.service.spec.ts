import { SagaService } from './saga.service';

const makePrisma = () => ({
  saga_state: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
});

const makeTx = (overrides: Record<string, unknown> = {}) => ({
  saga_state: {
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({ items_created: 1, items_confirmed: 1, items_cancelled: 1, total_items: 3 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  },
});

describe('SagaService', () => {
  let service: SagaService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SagaService(prisma as any);
  });

  // ── advanceTx ────────────────────────────────────────────────────────────────

  describe('advanceTx', () => {
    it('returns true when the step guard matches and update applies', async () => {
      const tx = makeTx();
      const result = await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'PROCESSING_PAYMENT',
        toStep: 'ISSUING_INVOICE',
      });
      expect(result).toBe(true);
      expect(tx.saga_state.updateMany).toHaveBeenCalledWith({
        where: { id: 'saga-1', current_step: 'PROCESSING_PAYMENT' },
        data: expect.objectContaining({ current_step: 'ISSUING_INVOICE' }),
      });
    });

    it('returns false when guard does not match (race condition / duplicate event)', async () => {
      const tx = makeTx({ updateMany: jest.fn().mockResolvedValue({ count: 0 }) });
      const result = await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'PROCESSING_PAYMENT',
        toStep: 'ISSUING_INVOICE',
      });
      expect(result).toBe(false);
    });

    it('writes paymentId and pendingCommandId from patch', async () => {
      const tx = makeTx();
      await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'PROCESSING_PAYMENT',
        toStep: 'ISSUING_INVOICE',
        patch: { paymentId: 'pago-abc', pendingCommandId: 'cmd-xyz' },
      });
      const [call] = (tx.saga_state.updateMany as jest.Mock).mock.calls;
      expect(call[0].data.payment_id).toBe('pago-abc');
      expect(call[0].data.pending_command_id).toBe('cmd-xyz');
    });

    it('writes invoiceId from patch', async () => {
      const tx = makeTx();
      await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'ISSUING_INVOICE',
        toStep: 'CONFIRMING_REMOTE_RESERVATIONS',
        patch: { invoiceId: 'fact-123' },
      });
      const [call] = (tx.saga_state.updateMany as jest.Mock).mock.calls;
      expect(call[0].data.invoice_id).toBe('fact-123');
    });

    it('sets completed_at when patch.completed is true', async () => {
      const tx = makeTx();
      await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'CONFIRMING_REMOTE_RESERVATIONS',
        toStep: 'COMPLETED',
        patch: { completed: true },
      });
      const [call] = (tx.saga_state.updateMany as jest.Mock).mock.calls;
      expect(call[0].data.completed_at).toBeInstanceOf(Date);
    });

    it('does not set completed_at when patch.completed is false', async () => {
      const tx = makeTx();
      await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'PENDING',
        toStep: 'CREATING_REMOTE_RESERVATIONS',
      });
      const [call] = (tx.saga_state.updateMany as jest.Mock).mock.calls;
      expect(call[0].data.completed_at).toBeUndefined();
    });

    it('clears pendingCommandId when patch.pendingCommandId is null', async () => {
      const tx = makeTx();
      await service.advanceTx(tx as any, {
        sagaId: 'saga-1',
        fromStep: 'ISSUING_INVOICE',
        toStep: 'CONFIRMING_REMOTE_RESERVATIONS',
        patch: { pendingCommandId: null },
      });
      const [call] = (tx.saga_state.updateMany as jest.Mock).mock.calls;
      expect(call[0].data.pending_command_id).toBeNull();
    });
  });

  // ── Counters ─────────────────────────────────────────────────────────────────

  describe('incrementItemsCreatedTx', () => {
    it('calls update with increment:1 and returns {created, total}', async () => {
      const tx = makeTx({ update: jest.fn().mockResolvedValue({ items_created: 2, total_items: 3 }) });
      const result = await service.incrementItemsCreatedTx(tx as any, 'saga-1');
      expect(result).toEqual({ created: 2, total: 3 });
      expect(tx.saga_state.update).toHaveBeenCalledWith({
        where: { id: 'saga-1' },
        data: { items_created: { increment: 1 }, updated_at: expect.any(Date) },
      });
    });
  });

  describe('incrementItemsConfirmedTx', () => {
    it('calls update with increment:1 on items_confirmed', async () => {
      const tx = makeTx({ update: jest.fn().mockResolvedValue({ items_confirmed: 1, total_items: 2 }) });
      const result = await service.incrementItemsConfirmedTx(tx as any, 'saga-1');
      expect(result).toEqual({ confirmed: 1, total: 2 });
      expect(tx.saga_state.update).toHaveBeenCalledWith({
        where: { id: 'saga-1' },
        data: { items_confirmed: { increment: 1 }, updated_at: expect.any(Date) },
      });
    });
  });

  describe('incrementItemsCancelledTx', () => {
    it('calls update with increment:1 on items_cancelled', async () => {
      const tx = makeTx({ update: jest.fn().mockResolvedValue({ items_cancelled: 3, total_items: 3 }) });
      const result = await service.incrementItemsCancelledTx(tx as any, 'saga-1');
      expect(result).toEqual({ cancelled: 3, total: 3 });
    });
  });

  // ── waitForTerminalState ──────────────────────────────────────────────────────

  describe('waitForTerminalState', () => {
    it('returns saga immediately when current_step is COMPLETED', async () => {
      const saga = { id: 'saga-1', current_step: 'COMPLETED' };
      prisma.saga_state.findUnique.mockResolvedValue(saga);
      const result = await service.waitForTerminalState('saga-1', 5000);
      expect(result).toEqual(saga);
    });

    it('returns saga when current_step is FAILED', async () => {
      const saga = { id: 'saga-1', current_step: 'FAILED', last_error: 'payment rejected' };
      prisma.saga_state.findUnique.mockResolvedValue(saga);
      const result = await service.waitForTerminalState('saga-1', 5000);
      expect(result).toEqual(saga);
    });

    it('returns saga when current_step is COMPENSATED', async () => {
      const saga = { id: 'saga-1', current_step: 'COMPENSATED' };
      prisma.saga_state.findUnique.mockResolvedValue(saga);
      const result = await service.waitForTerminalState('saga-1', 5000);
      expect(result).toEqual(saga);
    });

    it('returns null when saga is not found', async () => {
      prisma.saga_state.findUnique.mockResolvedValue(null);
      const result = await service.waitForTerminalState('saga-missing', 300);
      expect(result).toBeNull();
    });

    it('returns null when timeout expires before terminal state', async () => {
      prisma.saga_state.findUnique.mockResolvedValue({ id: 'saga-1', current_step: 'PROCESSING_PAYMENT' });
      const result = await service.waitForTerminalState('saga-1', 200, 50);
      expect(result).toBeNull();
    }, 2000);

    it('polls until terminal state arrives', async () => {
      prisma.saga_state.findUnique
        .mockResolvedValueOnce({ id: 'saga-1', current_step: 'CREATING_REMOTE_RESERVATIONS' })
        .mockResolvedValueOnce({ id: 'saga-1', current_step: 'PROCESSING_PAYMENT' })
        .mockResolvedValue({ id: 'saga-1', current_step: 'COMPLETED' });

      const result = await service.waitForTerminalState('saga-1', 5000, 50);
      expect(result?.current_step).toBe('COMPLETED');
      expect(prisma.saga_state.findUnique).toHaveBeenCalledTimes(3);
    }, 2000);
  });

  // ── findStaleSagas ────────────────────────────────────────────────────────────

  describe('findStaleSagas', () => {
    it('queries with a cutoff based on olderThanSeconds', async () => {
      prisma.saga_state.findMany.mockResolvedValue([]);
      const before = Date.now();
      await service.findStaleSagas(60);

      const [call] = prisma.saga_state.findMany.mock.calls;
      const cutoff: Date = call[0].where.updated_at.lt;
      expect(cutoff.getTime()).toBeLessThanOrEqual(before - 60_000 + 100);
    });

    it('excludes terminal steps (COMPLETED, COMPENSATED, FAILED)', async () => {
      prisma.saga_state.findMany.mockResolvedValue([]);
      await service.findStaleSagas(60);
      const [call] = prisma.saga_state.findMany.mock.calls;
      expect(call[0].where.current_step.notIn).toEqual(
        expect.arrayContaining(['COMPLETED', 'COMPENSATED', 'FAILED']),
      );
    });

    it('respects the limit parameter (default 50)', async () => {
      prisma.saga_state.findMany.mockResolvedValue([]);
      await service.findStaleSagas(60, 10);
      const [call] = prisma.saga_state.findMany.mock.calls;
      expect(call[0].take).toBe(10);
    });
  });

  // ── completeTx / failTx ───────────────────────────────────────────────────────

  describe('completeTx', () => {
    it('sets current_step to COMPLETED with completed_at', async () => {
      const tx = makeTx();
      await service.completeTx(tx as any, 'saga-1');
      expect(tx.saga_state.update).toHaveBeenCalledWith({
        where: { id: 'saga-1' },
        data: expect.objectContaining({ current_step: 'COMPLETED', completed_at: expect.any(Date) }),
      });
    });
  });

  describe('failTx', () => {
    it('sets current_step to FAILED with lastError', async () => {
      const tx = makeTx();
      await service.failTx(tx as any, 'saga-1', 'payment timeout');
      expect(tx.saga_state.update).toHaveBeenCalledWith({
        where: { id: 'saga-1' },
        data: expect.objectContaining({ current_step: 'FAILED', last_error: 'payment timeout' }),
      });
    });
  });

  // ── createTx ─────────────────────────────────────────────────────────────────

  describe('createTx', () => {
    it('creates the saga row with all required fields', async () => {
      const created = { id: 'saga-new', current_step: 'CREATING_REMOTE_RESERVATIONS' };
      const tx = { saga_state: { create: jest.fn().mockResolvedValue(created) } };
      const result = await service.createTx(tx as any, {
        reservaId: 'res-1',
        sagaType: 'CHECKOUT',
        initialStep: 'CREATING_REMOTE_RESERVATIONS',
        totalItems: 2,
        correlationId: 'corr-abc',
        context: { metodoPagoId: 'mp-1', monto: 180 },
      });
      expect(result).toEqual(created);
      expect(tx.saga_state.create).toHaveBeenCalledWith({
        data: {
          reserva_id: 'res-1',
          saga_type: 'CHECKOUT',
          current_step: 'CREATING_REMOTE_RESERVATIONS',
          total_items: 2,
          correlation_id: 'corr-abc',
          context: { metodoPagoId: 'mp-1', monto: 180 },
        },
      });
    });

    it('uses empty object as context when not provided', async () => {
      const tx = { saga_state: { create: jest.fn().mockResolvedValue({}) } };
      await service.createTx(tx as any, {
        reservaId: 'r',
        sagaType: 'CHECKOUT',
        initialStep: 'PENDING',
        totalItems: 1,
        correlationId: 'c',
      });
      const [call] = (tx.saga_state.create as jest.Mock).mock.calls;
      expect(call[0].data.context).toEqual({});
    });
  });
});
