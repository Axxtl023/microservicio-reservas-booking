import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

// Ver nota en outbox.service.ts sobre el typing de tx.
type TxClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica si un mensaje ya ha sido procesado (lectura sin escribir).
   * El consumer hace este check ANTES de procesar; la escritura va dentro
   * de la transacción que incluye saga.advance + outbox.save.
   */
  async isProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processed_messages.findUnique({
      where: { event_id: eventId },
    });
    return row !== null;
  }

  /**
   * Inserta el mensaje en processed_messages dentro de una transacción.
   * Si choca con UNIQUE (otro worker procesó en paralelo), la transacción
   * completa hace rollback y el consumer descarta el mensaje.
   */
  async markProcessedTx(tx: TxClient, eventId: string, eventType: string): Promise<void> {
    await tx.processed_messages.create({
      data: {
        event_id: eventId,
        event_type: eventType,
      },
    });
  }

  /**
   * Limpieza semanal: elimina mensajes procesados >30 días.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldMessages(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const { count } = await this.prisma.processed_messages.deleteMany({
      where: { processed_at: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`[inbox] Limpieza: ${count} mensajes eliminados (>30 días)`);
    }
  }
}
