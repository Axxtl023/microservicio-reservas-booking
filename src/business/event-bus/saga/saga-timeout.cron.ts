import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SagaService } from './saga.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Detecta sagas colgadas y las marca FAILED para que la respuesta HTTP no
 * quede colgada eternamente (el HTTP handler tiene su propio timeout pero
 * este es la salvaguarda backend si el handler se reinició).
 *
 * Trigger: cada minuto. Threshold: SAGA_STEP_TIMEOUT_S * 5 (default 30s * 5 = 2.5min).
 * Es un valor conservador para no marcar como FAILED algo que solo está lento.
 */
@Injectable()
export class SagaTimeoutCron {
  private readonly logger = new Logger(SagaTimeoutCron.name);
  private readonly thresholdSeconds = Number(process.env.SAGA_STEP_TIMEOUT_S ?? 30) * 5;

  constructor(
    private readonly saga: SagaService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scanStaleSagas(): Promise<void> {
    const stale = await this.saga.findStaleSagas(this.thresholdSeconds);
    if (stale.length === 0) return;

    this.logger.warn(`[saga-timeout] ${stale.length} sagas colgadas detectadas (threshold ${this.thresholdSeconds}s)`);

    for (const saga of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.saga.failTx(
            tx,
            saga.id,
            `SAGA_TIMEOUT: paso ${saga.current_step} sin avanzar por >${this.thresholdSeconds}s`,
          );
        });
        this.logger.warn(`[saga-timeout] saga ${saga.id} (reserva ${saga.reserva_id}) marcada FAILED`);
      } catch (err) {
        this.logger.error(`[saga-timeout] error marcando saga ${saga.id}: ${err}`);
      }
    }
  }
}
