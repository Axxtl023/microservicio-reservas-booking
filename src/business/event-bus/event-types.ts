// Topología cross-repo. NO modificar sin coordinar con identidad-finanzas
// e integracion. Documentado en EVENTS.md (raíz del repo).

export const EXCHANGES = {
  // ── Propios (publica/consume reservas-booking) ─────────────────────────────
  RESERVAS_EVENTS: 'reservas.events',         // auditoría: saga.* lifecycle
  RESERVAS_DLX:    'reservas.dlx',            // dead-letter exchange

  // ── Externos (publica reservas-booking, consume otro repo) ─────────────────
  PAYMENTS_COMMANDS:    'payments.commands',
  INVOICES_COMMANDS:    'invoices.commands',
  INTEGRATION_COMMANDS: 'integration.commands',

  // ── Externos (consume reservas-booking, publica otro repo) ────────────────
  PAYMENTS_EVENTS:    'payments.events',
  INVOICES_EVENTS:    'invoices.events',
  INTEGRATION_EVENTS: 'integration.events',
} as const;

export const ROUTING_KEYS = {
  // ── Comandos que publicamos a identidad-finanzas ──────────────────────────
  PAYMENT_PROCESS_REQUESTED: 'payment.process.requested',
  PAYMENT_REFUND_REQUESTED:  'payment.refund.requested',
  INVOICE_ISSUE_REQUESTED:   'invoice.issue.requested',
  INVOICE_VOID_REQUESTED:    'invoice.void.requested',

  // ── Comandos que publicamos a integracion ─────────────────────────────────
  RESERVATION_CREATE_REQUESTED:  'integration.reservation.create.requested',
  RESERVATION_CONFIRM_REQUESTED: 'integration.reservation.confirm.requested',
  RESERVATION_CANCEL_REQUESTED:  'integration.reservation.cancel.requested',

  // ── Eventos que consumimos de identidad-finanzas ──────────────────────────
  PAYMENT_PROCESSED:      'payment.processed',
  PAYMENT_FAILED:         'payment.failed',
  PAYMENT_REFUNDED:       'payment.refunded',
  PAYMENT_REFUND_FAILED:  'payment.refund_failed',
  INVOICE_ISSUED:         'invoice.issued',
  INVOICE_FAILED:         'invoice.failed',
  INVOICE_VOIDED:         'invoice.voided',

  // ── Eventos que consumimos de integracion ─────────────────────────────────
  RESERVATION_CREATED:        'integration.reservation.created',
  RESERVATION_CREATE_FAILED:  'integration.reservation.create_failed',
  RESERVATION_CONFIRMED:      'integration.reservation.confirmed',
  RESERVATION_CONFIRM_FAILED: 'integration.reservation.confirm_failed',
  RESERVATION_CANCELLED:      'integration.reservation.cancelled',
  RESERVATION_CANCEL_FAILED:  'integration.reservation.cancel_failed',

  // ── Auditoría propia (publica reservas-booking) ───────────────────────────
  SAGA_STARTED:   'saga.checkout.started',
  SAGA_COMPLETED: 'saga.checkout.completed',
  SAGA_FAILED:    'saga.checkout.failed',
} as const;

export const QUEUES = {
  // Una queue por evento que consumimos.
  // Naming: reservas.<dominio>.<evento>
  PAYMENT_PROCESSED:          'reservas.payment.processed',
  PAYMENT_FAILED:             'reservas.payment.failed',
  PAYMENT_REFUNDED:           'reservas.payment.refunded',
  PAYMENT_REFUND_FAILED:      'reservas.payment.refund_failed',
  INVOICE_ISSUED:             'reservas.invoice.issued',
  INVOICE_FAILED:             'reservas.invoice.failed',
  INVOICE_VOIDED:             'reservas.invoice.voided',
  RESERVATION_CREATED:        'reservas.integration.created',
  RESERVATION_CREATE_FAILED:  'reservas.integration.create_failed',
  RESERVATION_CONFIRMED:      'reservas.integration.confirmed',
  RESERVATION_CONFIRM_FAILED: 'reservas.integration.confirm_failed',
  RESERVATION_CANCELLED:      'reservas.integration.cancelled',
  RESERVATION_CANCEL_FAILED:  'reservas.integration.cancel_failed',
} as const;

// ── Tipos compartidos ─────────────────────────────────────────────────────────

export type ProviderType = 'VEHICLE' | 'FLIGHT' | 'HOTEL' | 'TOUR';

export type SagaType = 'CHECKOUT' | 'CANCELLATION';

export type SagaStep =
  | 'PENDING'
  | 'CREATING_REMOTE_RESERVATIONS'
  | 'PROCESSING_PAYMENT'
  | 'ISSUING_INVOICE'
  | 'CONFIRMING_REMOTE_RESERVATIONS'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'FAILED';

// ── Payload shapes — comandos que publicamos ──────────────────────────────────

export interface CreateReservationCommand {
  reservaId: string;
  itemId: string;
  providerId: string;
  providerType: ProviderType;
  quantity: number;
  unitPrice: number;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface ConfirmReservationCommand {
  reservaId: string;
  itemId: string;
  providerId: string;
  providerType: ProviderType;
  externalId: string;
}

export interface CancelReservationCommand {
  reservaId: string;
  itemId: string;
  providerId: string;
  providerType: ProviderType;
  externalId: string;
  motivo?: string;
}

export interface ProcessPaymentCommand {
  reservaId: string;
  monto: number;
  metodoPagoId: string;
}

export interface RefundPaymentCommand {
  pagoId: string;
  reservaId: string;
  motivo: string;
}

export interface IssueInvoiceCommand {
  reservaId: string;
  metodoPagoId: string;
  items: Array<{ idProducto: string; cantidad: number; precioUnitario: number }>;
}

export interface VoidInvoiceCommand {
  facturaId: string;
  reservaId: string;
  motivo: string;
}

// ── Payload shapes — eventos que consumimos ───────────────────────────────────

export interface ReservationCreatedEvent {
  reservaId: string;
  itemId: string;
  providerId: string;
  providerType: ProviderType;
  externalId: string;
  externalCode?: string;
  rawProviderResponse?: Record<string, unknown>;
}

export interface ReservationFailedEvent {
  reservaId: string;
  itemId: string;
  providerId: string;
  providerType: ProviderType;
  error: { code: string; message: string };
}

export interface ReservationConfirmedEvent {
  reservaId: string;
  itemId: string;
  providerId: string;
  externalId: string;
}

export interface ReservationCancelledEvent {
  reservaId: string;
  itemId: string;
  providerId: string;
  externalId: string;
}

export interface PaymentProcessedEvent {
  pagoId: string;
  reservaId: string;
  monto: number;
  status: string;
  fechaPago?: string;
}

export interface PaymentFailedEvent {
  reservaId: string;
  error: { code: string; message: string };
}

export interface PaymentRefundedEvent {
  pagoId: string;
  reservaId: string;
  monto: number;
  motivo: string;
  fechaReembolso?: string;
}

export interface InvoiceIssuedEvent {
  facturaId: string;
  numeroFactura: string;
  reservaId: string;
  total: number;
  iva: number;
  fechaEmision?: string;
}

export interface InvoiceFailedEvent {
  reservaId: string;
  error: { code: string; message: string };
}
