import { Injectable } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service';
import { wrap } from '../envelope';
import {
  EXCHANGES,
  ROUTING_KEYS,
  type CreateReservationCommand,
  type ConfirmReservationCommand,
  type CancelReservationCommand,
  type ProcessPaymentCommand,
  type RefundPaymentCommand,
  type IssueInvoiceCommand,
  type VoidInvoiceCommand,
} from '../event-types';

// Workaround typing tx.
type TxClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PublishOptions {
  tx: TxClient;
  correlationId: string;
  causationId?: string;
}

/**
 * Publishers de comandos cross-repo.
 *
 * Cada método envuelve el payload con `wrap()` y lo deposita en el outbox.
 * El `OutboxPublisherService` (cron 1s) los manda a RabbitMQ después.
 *
 * Todos los métodos requieren `tx` para garantizar atomicidad con la
 * mutación de saga_state que los dispara.
 *
 * El `causationId` lo pasa el caller — para HTTP handler es `undefined`
 * (comando raíz); para consumers que disparan otros comandos es el `eventId`
 * del evento recibido (para tracking de la cadena).
 */
@Injectable()
export class CommandPublishers {
  constructor(private readonly outbox: OutboxService) {}

  // ── Integration ────────────────────────────────────────────────────────────

  async createReservation(opts: PublishOptions, payload: CreateReservationCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.INTEGRATION_COMMANDS,
      ROUTING_KEYS.RESERVATION_CREATE_REQUESTED,
      payload,
    );
  }

  async confirmReservation(opts: PublishOptions, payload: ConfirmReservationCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.INTEGRATION_COMMANDS,
      ROUTING_KEYS.RESERVATION_CONFIRM_REQUESTED,
      payload,
    );
  }

  async cancelReservation(opts: PublishOptions, payload: CancelReservationCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.INTEGRATION_COMMANDS,
      ROUTING_KEYS.RESERVATION_CANCEL_REQUESTED,
      payload,
    );
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async processPayment(opts: PublishOptions, payload: ProcessPaymentCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.PAYMENTS_COMMANDS,
      ROUTING_KEYS.PAYMENT_PROCESS_REQUESTED,
      payload,
    );
  }

  async refundPayment(opts: PublishOptions, payload: RefundPaymentCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.PAYMENTS_COMMANDS,
      ROUTING_KEYS.PAYMENT_REFUND_REQUESTED,
      payload,
    );
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async issueInvoice(opts: PublishOptions, payload: IssueInvoiceCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.INVOICES_COMMANDS,
      ROUTING_KEYS.INVOICE_ISSUE_REQUESTED,
      payload,
    );
  }

  async voidInvoice(opts: PublishOptions, payload: VoidInvoiceCommand): Promise<string> {
    return this.publish(
      opts,
      EXCHANGES.INVOICES_COMMANDS,
      ROUTING_KEYS.INVOICE_VOID_REQUESTED,
      payload,
    );
  }

  // ── Auditoría propia (saga lifecycle) ──────────────────────────────────────

  async sagaStarted(opts: PublishOptions, payload: { sagaId: string; reservaId: string; sagaType: string }): Promise<string> {
    return this.publish(opts, EXCHANGES.RESERVAS_EVENTS, ROUTING_KEYS.SAGA_STARTED, payload);
  }

  async sagaCompleted(opts: PublishOptions, payload: { sagaId: string; reservaId: string }): Promise<string> {
    return this.publish(opts, EXCHANGES.RESERVAS_EVENTS, ROUTING_KEYS.SAGA_COMPLETED, payload);
  }

  async sagaFailed(opts: PublishOptions, payload: { sagaId: string; reservaId: string; error: string }): Promise<string> {
    return this.publish(opts, EXCHANGES.RESERVAS_EVENTS, ROUTING_KEYS.SAGA_FAILED, payload);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /**
   * Helper común: arma envelope, guarda en outbox, devuelve el eventId para
   * que el caller pueda persistirlo en saga.pending_command_id si lo necesita.
   */
  private async publish<T>(
    opts: PublishOptions,
    exchange: string,
    routingKey: string,
    payload: T,
  ): Promise<string> {
    const envelope = wrap(routingKey, payload, {
      correlationId: opts.correlationId,
      causationId: opts.causationId,
    });
    await this.outbox.save(opts.tx, exchange, routingKey, envelope);
    return envelope.eventId;
  }
}
