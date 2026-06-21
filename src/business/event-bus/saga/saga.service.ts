import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { SagaStep, SagaType } from '../event-types';

// Mismo workaround de typing que outbox/inbox.
type TxClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SagaStateRow {
  id: string;
  reserva_id: string;
  saga_type: string;
  current_step: string;
  total_items: number;
  items_created: number;
  items_confirmed: number;
  items_cancelled: number;
  pending_command_id: string | null;
  payment_id: string | null;
  invoice_id: string | null;
  last_error: string | null;
  context: unknown;
  correlation_id: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateSagaInput {
  reservaId: string;
  sagaType: SagaType;
  initialStep: SagaStep;
  totalItems: number;
  correlationId: string;
  context?: Record<string, unknown>;
}

export interface AdvanceInput {
  sagaId: string;
  fromStep: SagaStep;
  toStep: SagaStep;
  patch?: {
    paymentId?: string;
    invoiceId?: string;
    pendingCommandId?: string | null;
    lastError?: string | null;
    completed?: boolean;
  };
}

/**
 * Máquina de estados de las sagas (CHECKOUT y CANCELLATION).
 *
 * Único de este repo. El advance() usa guard `WHERE current_step = fromStep` para
 * evitar races: si dos consumers reciben el mismo evento y avanzan en paralelo,
 * uno gana y el otro recibe `count: 0` (no aplica el cambio). Idempotencia capa 2.
 *
 * Los contadores `items_*` se incrementan atómicamente con `increment` cuando
 * llegan eventos individuales de cada item (un evento por item de la reserva).
 * El caller verifica si llegó al total para disparar el siguiente paso.
 */
@Injectable()
export class SagaService {
  private readonly logger = new Logger(SagaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ───────────────────────────────────────────────────────────────────

  async findByReservaId(reservaId: string): Promise<SagaStateRow | null> {
    return this.prisma.saga_state.findUnique({ where: { reserva_id: reservaId } }) as Promise<SagaStateRow | null>;
  }

  async findById(id: string): Promise<SagaStateRow | null> {
    return this.prisma.saga_state.findUnique({ where: { id } }) as Promise<SagaStateRow | null>;
  }

  /**
   * Para mapear un evento entrante (con `causationId`) a la saga que disparó el
   * comando. Se usa cuando el evento NO trae reservaId (raro) o como guard
   * adicional para correlación.
   */
  async findByPendingCommandId(commandEventId: string): Promise<SagaStateRow | null> {
    return this.prisma.saga_state.findFirst({
      where: { pending_command_id: commandEventId },
    }) as Promise<SagaStateRow | null>;
  }

  /**
   * Sagas en estado intermedio que no avanzaron en N segundos.
   * Para el cron de timeout.
   */
  async findStaleSagas(olderThanSeconds: number, limit = 50): Promise<SagaStateRow[]> {
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
    const terminalSteps: SagaStep[] = ['COMPLETED', 'COMPENSATED', 'FAILED'];
    return this.prisma.saga_state.findMany({
      where: {
        current_step: { notIn: terminalSteps },
        updated_at: { lt: cutoff },
      },
      orderBy: { updated_at: 'asc' },
      take: limit,
    }) as Promise<SagaStateRow[]>;
  }

  // ── Writes (con tx — para componer con outbox + inbox) ─────────────────────

  /**
   * Crea una saga nueva. Lanza si ya existe una para ese reservaId.
   * Debe llamarse dentro de la transacción del HTTP handler junto con la
   * creación de la reserva local.
   */
  async createTx(tx: TxClient, input: CreateSagaInput): Promise<SagaStateRow> {
    const row = await tx.saga_state.create({
      data: {
        reserva_id: input.reservaId,
        saga_type: input.sagaType,
        current_step: input.initialStep,
        total_items: input.totalItems,
        correlation_id: input.correlationId,
        context: (input.context ?? {}) as object,
      },
    });
    return row as SagaStateRow;
  }

  /**
   * Avanza la saga de `fromStep` → `toStep` con guard. Devuelve `true` si
   * aplicó el cambio (idempotencia capa 2: el segundo intento devuelve `false`
   * sin tocar nada).
   *
   * El `patch` permite setear payment_id, invoice_id, pending_command_id, etc.
   * en la misma operación atómica.
   */
  async advanceTx(tx: TxClient, input: AdvanceInput): Promise<boolean> {
    const data: Record<string, unknown> = {
      current_step: input.toStep,
      updated_at: new Date(),
    };
    if (input.patch?.paymentId !== undefined) data.payment_id = input.patch.paymentId;
    if (input.patch?.invoiceId !== undefined) data.invoice_id = input.patch.invoiceId;
    if (input.patch?.pendingCommandId !== undefined) data.pending_command_id = input.patch.pendingCommandId;
    if (input.patch?.lastError !== undefined) data.last_error = input.patch.lastError;
    if (input.patch?.completed) data.completed_at = new Date();

    const { count } = await tx.saga_state.updateMany({
      where: { id: input.sagaId, current_step: input.fromStep },
      data,
    });

    if (count === 0) {
      this.logger.warn(
        `[saga] advance NO aplicó: saga=${input.sagaId} from=${input.fromStep} to=${input.toStep} ` +
          `(probable race condition o evento duplicado — esperado en idempotencia)`,
      );
      return false;
    }
    return true;
  }

  /**
   * Incrementa items_created atómicamente y devuelve el nuevo valor + el total.
   * El caller decide si llegó al total para disparar el siguiente paso.
   * NO requiere guard de step — se usa para acumular eventos de items en paralelo.
   */
  async incrementItemsCreatedTx(tx: TxClient, sagaId: string): Promise<{ created: number; total: number }> {
    const row = await tx.saga_state.update({
      where: { id: sagaId },
      data: { items_created: { increment: 1 }, updated_at: new Date() },
    });
    return { created: row.items_created, total: row.total_items };
  }

  async incrementItemsConfirmedTx(tx: TxClient, sagaId: string): Promise<{ confirmed: number; total: number }> {
    const row = await tx.saga_state.update({
      where: { id: sagaId },
      data: { items_confirmed: { increment: 1 }, updated_at: new Date() },
    });
    return { confirmed: row.items_confirmed, total: row.total_items };
  }

  async incrementItemsCancelledTx(tx: TxClient, sagaId: string): Promise<{ cancelled: number; total: number }> {
    const row = await tx.saga_state.update({
      where: { id: sagaId },
      data: { items_cancelled: { increment: 1 }, updated_at: new Date() },
    });
    return { cancelled: row.items_cancelled, total: row.total_items };
  }

  /**
   * Marca la saga como COMPLETED. Sin guard — sirve para forzar cierre desde
   * cualquier paso (raro, normalmente se llega vía advance).
   */
  async completeTx(tx: TxClient, sagaId: string): Promise<void> {
    await tx.saga_state.update({
      where: { id: sagaId },
      data: { current_step: 'COMPLETED', completed_at: new Date(), updated_at: new Date() },
    });
  }

  /**
   * Marca la saga como FAILED. Para usar cuando la compensación termina.
   */
  async failTx(tx: TxClient, sagaId: string, lastError: string): Promise<void> {
    await tx.saga_state.update({
      where: { id: sagaId },
      data: { current_step: 'FAILED', last_error: lastError, completed_at: new Date(), updated_at: new Date() },
    });
  }

  // ── Espera bloqueante (para el HTTP handler) ───────────────────────────────

  /**
   * Polling de la saga hasta que llegue a COMPLETED/FAILED o timeout.
   * El HTTP handler de checkout llama esto para mantener el contrato sync de V1.
   *
   * Strategy: poll cada 100ms (configurable). El consumer avanza la saga vía
   * RabbitMQ, este loop la observa en BD. Es simple y no requiere EventEmitter
   * cross-process (que sí necesitaríamos si hubiera múltiples réplicas
   * compartiendo el HTTP request — no es el caso hoy).
   *
   * @returns la saga en su estado terminal | null si timeout
   */
  async waitForTerminalState(
    sagaId: string,
    timeoutMs: number,
    pollIntervalMs = 100,
  ): Promise<SagaStateRow | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const saga = await this.findById(sagaId);
      if (!saga) return null;
      if (saga.current_step === 'COMPLETED' || saga.current_step === 'FAILED' || saga.current_step === 'COMPENSATED') {
        return saga;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return null; // timeout
  }
}
