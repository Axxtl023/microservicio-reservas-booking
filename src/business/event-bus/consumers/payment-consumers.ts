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
  type PaymentProcessedEvent,
  type PaymentFailedEvent,
  type PaymentRefundedEvent,
} from '../event-types';
import { runWithCorrelationId } from '../../../common/observability/trace-context';
import { MetricsService } from '../../../common/observability/metrics.service';

const dlxOpts = (deadKey: string) => ({
  durable: true,
  deadLetterExchange: EXCHANGES.RESERVAS_DLX,
  deadLetterRoutingKey: deadKey,
});

/**
 * Consume `payment.processed`.
 * Avanza a ISSUING_INVOICE y publica invoice.issue.requested.
 */
@Injectable()
export class PaymentProcessedConsumer {
  private readonly logger = new Logger(PaymentProcessedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.PAYMENTS_EVENTS,
    routingKey: ROUTING_KEYS.PAYMENT_PROCESSED,
    queue: QUEUES.PAYMENT_PROCESSED,
    queueOptions: dlxOpts('reservas.payment.processed.dead'),
  })
  async handle(envelope: EventEnvelope<PaymentProcessedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;

      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga || saga.current_step !== 'PROCESSING_PAYMENT') return;

      // Buscar los items del carrito para armar el comando de factura
      const items = await this.prisma.detalles_reserva.findMany({
        where: { id_reserva: payload.reservaId },
      });
      const invoiceItems = items.map((it) => ({
        idProducto: it.id_externo ?? it.id ?? '',
        cantidad: it.cantidad,
        precioUnitario: Number(it.precio_unitario),
      }));

      const ctx = (saga.context ?? {}) as { metodoPagoId?: string };

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        const commandId = await this.publishers.issueInvoice(
          { tx, correlationId, causationId: eventId },
          { reservaId: payload.reservaId, metodoPagoId: ctx.metodoPagoId ?? '', items: invoiceItems },
        );
        await this.saga.advanceTx(tx, {
          sagaId: saga.id,
          fromStep: 'PROCESSING_PAYMENT',
          toStep: 'ISSUING_INVOICE',
          patch: { paymentId: payload.pagoId, pendingCommandId: commandId },
        });
      });
      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `payment.failed`.
 * Avanza a COMPENSATING — cancelar items ya creados en integracion.
 */
@Injectable()
export class PaymentFailedConsumer {
  private readonly logger = new Logger(PaymentFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.PAYMENTS_EVENTS,
    routingKey: ROUTING_KEYS.PAYMENT_FAILED,
    queue: QUEUES.PAYMENT_FAILED,
    queueOptions: dlxOpts('reservas.payment.failed.dead'),
  })
  async handle(envelope: EventEnvelope<PaymentFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;
      const errMsg = `${payload.error.code}: ${payload.error.message}`;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        if (saga.current_step === 'PROCESSING_PAYMENT') {
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'PROCESSING_PAYMENT',
            toStep: 'COMPENSATING',
            patch: { lastError: errMsg },
          });
        }
      });
      this.logger.warn(`[payment.failed] saga ${saga.id} → COMPENSATING (${errMsg})`);
      this.metrics.incrementFailed(eventType);
    });
  }
}

/**
 * Consume `payment.refunded`. Solo audita — la compensación coordinada continúa
 * en el cron de compensación.
 */
@Injectable()
export class PaymentRefundedConsumer {
  private readonly logger = new Logger(PaymentRefundedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.PAYMENTS_EVENTS,
    routingKey: ROUTING_KEYS.PAYMENT_REFUNDED,
    queue: QUEUES.PAYMENT_REFUNDED,
    queueOptions: dlxOpts('reservas.payment.refunded.dead'),
  })
  async handle(envelope: EventEnvelope<PaymentRefundedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        // Marcador: refund completo. Si la saga está en COMPENSATING y este es
        // el último paso pendiente, el cron de compensación cierra la saga.
        await tx.saga_state.update({
          where: { id: saga.id },
          data: { last_error: null, updated_at: new Date() },
        });
      });
      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `payment.refund_failed`. Auditoría — requiere intervención manual.
 */
@Injectable()
export class PaymentRefundFailedConsumer {
  private readonly logger = new Logger(PaymentRefundFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.PAYMENTS_EVENTS,
    routingKey: ROUTING_KEYS.PAYMENT_REFUND_FAILED,
    queue: QUEUES.PAYMENT_REFUND_FAILED,
    queueOptions: dlxOpts('reservas.payment.refund_failed.dead'),
  })
  async handle(envelope: EventEnvelope<PaymentFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;

      const errMsg = `REFUND_RECONCILIATION_NEEDED: ${payload.error.code} ${payload.error.message}`;
      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        await tx.saga_state.update({
          where: { id: saga.id },
          data: { last_error: errMsg, updated_at: new Date() },
        });
      });
      this.logger.error(`[payment.refund_failed] saga ${saga.id} ${errMsg}`);
      this.metrics.incrementFailed(eventType);
    });
  }
}
