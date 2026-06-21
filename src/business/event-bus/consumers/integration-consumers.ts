import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';
import { SagaService } from '../saga/saga.service';
import { CommandPublishers } from '../publishers/command-publishers';
import { isValidEnvelope } from '../envelope';
import type { EventEnvelope } from '../envelope';
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
  type ReservationCreatedEvent,
  type ReservationConfirmedEvent,
  type ReservationCancelledEvent,
  type ReservationFailedEvent,
} from '../event-types';
import { runWithCorrelationId } from '../../../common/observability/trace-context';
import { MetricsService } from '../../../common/observability/metrics.service';

const dlxOpts = (deadKey: string) => ({
  durable: true,
  deadLetterExchange: EXCHANGES.RESERVAS_DLX,
  deadLetterRoutingKey: deadKey,
});

/**
 * Consume `integration.reservation.created`.
 *
 * Acumula 1 item creado. Si llegamos al total → avanza a PROCESSING_PAYMENT
 * y publica payment.process.requested.
 */
@Injectable()
export class IntegrationCreatedConsumer {
  private readonly logger = new Logger(IntegrationCreatedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CREATED,
    queue: QUEUES.RESERVATION_CREATED,
    queueOptions: dlxOpts('reservas.integration.created.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationCreatedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;

      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga || saga.current_step !== 'CREATING_REMOTE_RESERVATIONS') {
        this.logger.warn(`[integration.created] saga estado inválido: ${saga?.current_step}, skip`);
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        const { created, total } = await this.saga.incrementItemsCreatedTx(tx, saga.id);

        if (created >= total) {
          // Todos los items creados → avanzar a PROCESSING_PAYMENT y publicar comando de pago
          const ctx = (saga.context ?? {}) as { monto?: number; metodoPagoId?: string };
          if (!ctx.monto || !ctx.metodoPagoId) {
            await this.saga.failTx(tx, saga.id, 'saga.context incompleto: falta monto o metodoPagoId');
            return;
          }
          const commandId = await this.publishers.processPayment(
            { tx, correlationId, causationId: eventId },
            { reservaId: payload.reservaId, monto: ctx.monto, metodoPagoId: ctx.metodoPagoId },
          );
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'CREATING_REMOTE_RESERVATIONS',
            toStep: 'PROCESSING_PAYMENT',
            patch: { pendingCommandId: commandId },
          });
        }
      });

      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `integration.reservation.create_failed`.
 * Avanza a COMPENSATING. Cancela los items que SÍ se crearon (best effort).
 */
@Injectable()
export class IntegrationCreateFailedConsumer {
  private readonly logger = new Logger(IntegrationCreateFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CREATE_FAILED,
    queue: QUEUES.RESERVATION_CREATE_FAILED,
    queueOptions: dlxOpts('reservas.integration.create_failed.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;

      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;
      // Aceptamos el evento aunque ya hayamos salido del paso (idempotente)
      const errMsg = `${payload.error.code}: ${payload.error.message}`;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        if (saga.current_step === 'CREATING_REMOTE_RESERVATIONS') {
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'CREATING_REMOTE_RESERVATIONS',
            toStep: 'COMPENSATING',
            patch: { lastError: errMsg },
          });
        }
      });
      this.logger.warn(`[integration.create_failed] saga ${saga.id} → COMPENSATING (${errMsg})`);
      this.metrics.incrementFailed(eventType);
    });
  }
}

/**
 * Consume `integration.reservation.confirmed`.
 * Si todos los items confirmados → COMPLETED.
 */
@Injectable()
export class IntegrationConfirmedConsumer {
  private readonly logger = new Logger(IntegrationConfirmedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CONFIRMED,
    queue: QUEUES.RESERVATION_CONFIRMED,
    queueOptions: dlxOpts('reservas.integration.confirmed.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationConfirmedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;

      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga || saga.current_step !== 'CONFIRMING_REMOTE_RESERVATIONS') return;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        const { confirmed, total } = await this.saga.incrementItemsConfirmedTx(tx, saga.id);

        if (confirmed >= total) {
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'CONFIRMING_REMOTE_RESERVATIONS',
            toStep: 'COMPLETED',
            patch: { completed: true, pendingCommandId: null },
          });
          await this.publishers.sagaCompleted(
            { tx, correlationId, causationId: eventId },
            { sagaId: saga.id, reservaId: payload.reservaId },
          );
        }
      });

      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `integration.reservation.confirm_failed`.
 * Avanza a COMPENSATING. Compensación: refund + void invoice + cancel items ya confirmados.
 */
@Injectable()
export class IntegrationConfirmFailedConsumer {
  private readonly logger = new Logger(IntegrationConfirmFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CONFIRM_FAILED,
    queue: QUEUES.RESERVATION_CONFIRM_FAILED,
    queueOptions: dlxOpts('reservas.integration.confirm_failed.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;
      const errMsg = `${payload.error.code}: ${payload.error.message}`;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        if (saga.current_step === 'CONFIRMING_REMOTE_RESERVATIONS') {
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'CONFIRMING_REMOTE_RESERVATIONS',
            toStep: 'COMPENSATING',
            patch: { lastError: errMsg },
          });
        }
      });
      this.logger.warn(`[integration.confirm_failed] saga ${saga.id} → COMPENSATING (${errMsg})`);
      this.metrics.incrementFailed(eventType);
    });
  }
}

/**
 * Consume `integration.reservation.cancelled`.
 * Usado tanto en flujo de cancelación normal como en compensación.
 */
@Injectable()
export class IntegrationCancelledConsumer {
  private readonly logger = new Logger(IntegrationCancelledConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CANCELLED,
    queue: QUEUES.RESERVATION_CANCELLED,
    queueOptions: dlxOpts('reservas.integration.cancelled.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationCancelledEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        await this.saga.incrementItemsCancelledTx(tx, saga.id);
      });
      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `integration.reservation.cancel_failed`.
 * Audita y notifica — la compensación NO se reintenta automáticamente,
 * requiere intervención manual.
 */
@Injectable()
export class IntegrationCancelFailedConsumer {
  private readonly logger = new Logger(IntegrationCancelFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INTEGRATION_EVENTS,
    routingKey: ROUTING_KEYS.RESERVATION_CANCEL_FAILED,
    queue: QUEUES.RESERVATION_CANCEL_FAILED,
    queueOptions: dlxOpts('reservas.integration.cancel_failed.dead'),
  })
  async handle(envelope: EventEnvelope<ReservationFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;

      const errMsg = `MANUAL_INTERVENTION_NEEDED: cancel failed ${payload.error.code} ${payload.error.message}`;
      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        // Solo registramos el error en la saga; no avanzamos el estado porque
        // requiere intervención manual (no podemos auto-resolver doble booking).
        await tx.saga_state.update({
          where: { id: saga.id },
          data: { last_error: errMsg, updated_at: new Date() },
        });
      });
      this.logger.error(`[integration.cancel_failed] saga ${saga.id} ${errMsg}`);
      this.metrics.incrementFailed(eventType);
    });
  }
}
