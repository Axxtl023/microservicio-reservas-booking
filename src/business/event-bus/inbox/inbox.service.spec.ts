import { InboxService } from './inbox.service';

const makePrisma = () => ({
  processed_messages: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
});

describe('InboxService', () => {
  let service: InboxService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InboxService(prisma as any);
  });

  describe('isProcessed', () => {
    it('returns false when event has not been processed', async () => {
      prisma.processed_messages.findUnique.mockResolvedValue(null);
      expect(await service.isProcessed('evt-new')).toBe(false);
      expect(prisma.processed_messages.findUnique).toHaveBeenCalledWith({
        where: { event_id: 'evt-new' },
      });
    });

    it('returns true when event already exists in processed_messages', async () => {
      prisma.processed_messages.findUnique.mockResolvedValue({ event_id: 'evt-1', event_type: 'payment.processed' });
      expect(await service.isProcessed('evt-1')).toBe(true);
    });
  });

  describe('markProcessedTx', () => {
    it('creates a processed_messages row inside the transaction', async () => {
      const tx = { processed_messages: { create: jest.fn().mockResolvedValue({}) } };
      await service.markProcessedTx(tx, 'evt-1', 'payment.processed');
      expect(tx.processed_messages.create).toHaveBeenCalledWith({
        data: { event_id: 'evt-1', event_type: 'payment.processed' },
      });
    });

    it('propagates errors (duplicate key should bubble up to rollback the tx)', async () => {
      const tx = {
        processed_messages: {
          create: jest.fn().mockRejectedValue(new Error('Unique constraint violation')),
        },
      };
      await expect(service.markProcessedTx(tx, 'dup', 'any.event')).rejects.toThrow('Unique constraint');
    });
  });

  describe('cleanupOldMessages', () => {
    it('deletes messages with processed_at older than 30 days', async () => {
      prisma.processed_messages.deleteMany.mockResolvedValue({ count: 5 });
      const before = new Date();
      await service.cleanupOldMessages();
      const after = new Date();

      const [call] = prisma.processed_messages.deleteMany.mock.calls;
      const cutoff: Date = call[0].where.processed_at.lt;
      const thirtyDaysAgo = new Date(before.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(thirtyDaysAgo.getTime() - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('does not throw when no messages to delete', async () => {
      prisma.processed_messages.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.cleanupOldMessages()).resolves.toBeUndefined();
    });
  });
});
