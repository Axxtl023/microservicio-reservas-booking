import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MetricsService } from '../../../common/observability/metrics.service';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly batchSize = Number(process.env.OUTBOX_BATCH_SIZE) || 50;
  private readonly maxAttempts = Number(process.env.OUTBOX_MAX_ATTEMPTS) || 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Worker cada segundo. Lee eventos no publicados, publica a RabbitMQ,
   * marca published_at. En error: attempts++ y last_error.
   * Nunca borra registros (append-only).
   */
  @Cron(CronExpression.EVERY_SECOND)
  async publishPending(): Promise<void> {
    const pending = await this.prisma.event_outbox.findMany({
      where: {
        published_at: null,
        attempts: { lt: this.maxAttempts },
      },
      orderBy: { created_at: 'asc' },
      take: this.batchSize,
    });

    if (pending.length === 0) return;

    for (const record of pending) {
      try {
        await this.amqp.publish(record.exchange, record.routing_key, record.payload);
        await this.prisma.event_outbox.update({
          where: { id: record.id },
          data: { published_at: new Date() },
        });
        this.metrics.incrementPublished(record.event_type);
        this.logger.debug(`[outbox] Publicado ${record.event_type} (${record.event_id})`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.event_outbox.update({
          where: { id: record.id },
          data: { attempts: { increment: 1 }, last_error: message },
        });
        this.logger.warn(`[outbox] Fallo al publicar ${record.event_id}: ${message}`);
        if (record.attempts + 1 >= this.maxAttempts) {
          this.logger.error(
            `[outbox] CRÍTICO: ${record.event_id} (${record.event_type}) alcanzó ${this.maxAttempts} intentos. Revisión manual.`,
          );
        }
      }
    }
  }
}
