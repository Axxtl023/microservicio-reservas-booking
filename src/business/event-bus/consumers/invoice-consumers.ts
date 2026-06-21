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
  type InvoiceIssuedEvent,
  type InvoiceFailedEvent,
  type ProviderType,
} from '../event-types';
import { runWithCorrelationId } from '../../../common/observability/trace-context';
import { MetricsService } from '../../../common/observability/metrics.service';

const dlxOpts = (deadKey: string) => ({
  durable: true,
  deadLetterExchange: EXCHANGES.RESERVAS_DLX,
  deadLetterRoutingKey: deadKey,
});

// Mapeo de proveedores.tipo (BD) → ProviderType (proto enum).
const TIPO_TO_PROVIDER: Record<string, ProviderType> = {
  VEHICLE: 'VEHICLE',
  FLIGHT: 'FLIGHT',
  HOTEL: 'HOTEL',
  ATTRACTION: 'TOUR',
};

/**
 * Consume `invoice.issued`.
 * Avanza a CONFIRMING_REMOTE_RESERVATIONS y publica integration.reservation.confirm.requested
 * por cada item.
 */
@Injectable()
export class InvoiceIssuedConsumer {
  private readonly logger = new Logger(InvoiceIssuedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INVOICES_EVENTS,
    routingKey: ROUTING_KEYS.INVOICE_ISSUED,
    queue: QUEUES.INVOICE_ISSUED,
    queueOptions: dlxOpts('reservas.invoice.issued.dead'),
  })
  async handle(envelope: EventEnvelope<InvoiceIssuedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga || saga.current_step !== 'ISSUING_INVOICE') return;

      // Cargar detalles + proveedor para publicar 1 confirm command por item
      const detalles = await this.prisma.detalles_reserva.findMany({
        where: { id_reserva: payload.reservaId },
        include: { proveedores: true },
      });

      const confirmable = detalles.filter((d) => d.id_externo && d.proveedores);
      if (confirmable.length === 0) {
        this.logger.warn(`[invoice.issued] No hay items confirmables para saga ${saga.id}`);
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        for (const det of confirmable) {
          const providerType = TIPO_TO_PROVIDER[det.proveedores!.tipo];
          if (!providerType) continue;
          await this.publishers.confirmReservation(
            { tx, correlationId, causationId: eventId },
            {
              reservaId: payload.reservaId,
              itemId: det.id,
              providerId: det.id_proveedor!,
              providerType,
              externalId: det.id_externo!,
            },
          );
        }
        // Persistir datos de factura en context para que el HTTP handler V2
        // pueda armar la respuesta IssueInvoiceResponse al completar.
        const ctx = (saga.context ?? {}) as Record<string, unknown>;
        const ctxWithInvoice = {
          ...ctx,
          invoice: {
            idFactura: payload.facturaId,
            numeroFactura: payload.numeroFactura,
            totalCents: Math.round(payload.total * 100),
          },
        };
        await tx.saga_state.update({
          where: { id: saga.id },
          data: { context: ctxWithInvoice as object },
        });
        await this.saga.advanceTx(tx, {
          sagaId: saga.id,
          fromStep: 'ISSUING_INVOICE',
          toStep: 'CONFIRMING_REMOTE_RESERVATIONS',
          patch: { invoiceId: payload.facturaId, pendingCommandId: null },
        });
      });
      this.metrics.incrementProcessed(eventType);
    });
  }
}

/**
 * Consume `invoice.failed`.
 * Avanza a COMPENSATING — refund + void invoice (no aplica) + cancel items.
 */
@Injectable()
export class InvoiceFailedConsumer {
  private readonly logger = new Logger(InvoiceFailedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INVOICES_EVENTS,
    routingKey: ROUTING_KEYS.INVOICE_FAILED,
    queue: QUEUES.INVOICE_FAILED,
    queueOptions: dlxOpts('reservas.invoice.failed.dead'),
  })
  async handle(envelope: EventEnvelope<InvoiceFailedEvent>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;
      const errMsg = `${payload.error.code}: ${payload.error.message}`;

      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        if (saga.current_step === 'ISSUING_INVOICE') {
          await this.saga.advanceTx(tx, {
            sagaId: saga.id,
            fromStep: 'ISSUING_INVOICE',
            toStep: 'COMPENSATING',
            patch: { lastError: errMsg },
          });
        }
      });
      this.logger.warn(`[invoice.failed] saga ${saga.id} → COMPENSATING (${errMsg})`);
      this.metrics.incrementFailed(eventType);
    });
  }
}

/**
 * Consume `invoice.voided`. Auditoría — marca el invoice como anulado.
 */
@Injectable()
export class InvoiceVoidedConsumer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly saga: SagaService,
    private readonly metrics: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.INVOICES_EVENTS,
    routingKey: ROUTING_KEYS.INVOICE_VOIDED,
    queue: QUEUES.INVOICE_VOIDED,
    queueOptions: dlxOpts('reservas.invoice.voided.dead'),
  })
  async handle(envelope: EventEnvelope<{ reservaId: string }>): Promise<void> {
    if (!isValidEnvelope(envelope) || !envelope.payload?.reservaId) return;
    const { eventId, correlationId, payload, eventType } = envelope;

    await runWithCorrelationId(correlationId, async () => {
      if (await this.inbox.isProcessed(eventId)) return;
      const saga = await this.saga.findByReservaId(payload.reservaId);
      if (!saga) return;
      await this.prisma.$transaction(async (tx) => {
        await this.inbox.markProcessedTx(tx, eventId, eventType);
        await tx.saga_state.update({
          where: { id: saga.id },
          data: { updated_at: new Date() },
        });
      });
      this.metrics.incrementProcessed(eventType);
    });
  }
}
