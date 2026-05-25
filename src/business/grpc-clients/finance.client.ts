import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { v4 as uuidv4 } from 'uuid';

export const FINANCE_GRPC_CLIENT = 'FINANCE_GRPC_CLIENT';

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ProcessPaymentResponse {
  idPago?: string;
  id_pago?: string;
  status: string;
  amountCents?: number;
  amount_cents?: number;
  currency: string;
}

export interface IssueInvoiceResponse {
  idFactura?: string;
  id_factura?: string;
  numeroFactura?: string;
  numero_factura?: string;
  status: string;
  totalCents?: number;
  total_cents?: number;
  currency: string;
}

export interface RefundPaymentResponse {
  idReembolso?: string;
  id_reembolso?: string;
  idPago?: string;
  id_pago?: string;
  status: string;
  amountCents?: number;
  amount_cents?: number;
}

export type RefundPaymentResult =
  | (RefundPaymentResponse & { unimplemented?: false })
  | { unimplemented: true; message: string };

export interface GetPaymentByReservaIdResponse {
  idPago?: string;
  id_pago?: string;
  status: string;
  amountCents?: number;
  amount_cents?: number;
}

interface FinanceGrpcService {
  processPayment(request: {
    idempotencyKey: string;
    clienteId: string;
    amountCents: number;
    currency: string;
    metodoPagoId: string;
    reservaId: string;
  }): Observable<ProcessPaymentResponse>;
  issueInvoice(request: {
    idempotencyKey: string;
    idPago: string;
    clienteId: string;
    reservaId: string;
    lines: InvoiceLine[];
    totalCents: number;
    currency: string;
  }): Observable<IssueInvoiceResponse>;
  refundPayment(request: {
    idempotencyKey: string;
    idPago: string;
    amountCents: number;
    reason: string;
  }): Observable<RefundPaymentResponse>;
  getPaymentByReservaId(request: { reservaId: string }): Observable<GetPaymentByReservaIdResponse>;
}

export class FinanceUnavailableError extends Error {}
export class PaymentRejectedError extends Error {}

@Injectable()
export class FinanceClient implements OnModuleInit {
  private service!: FinanceGrpcService;

  constructor(@Inject(FINANCE_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.service = this.client.getService<FinanceGrpcService>('FinanceService');
  }

  async processPayment(data: {
    clienteId: string;
    amountCents: number;
    currency: string;
    metodoPagoId: string;
    reservaId: string;
    idempotencyKey?: string;
  }): Promise<ProcessPaymentResponse> {
    try {
      return await firstValueFrom(
        this.service.processPayment({
          idempotencyKey: data.idempotencyKey ?? uuidv4(),
          clienteId: data.clienteId,
          amountCents: data.amountCents,
          currency: data.currency,
          metodoPagoId: data.metodoPagoId,
          reservaId: data.reservaId,
        }),
      );
    } catch (error) {
      throw this.toDomainError(error, PaymentRejectedError);
    }
  }

  async issueInvoice(data: {
    idPago: string;
    clienteId: string;
    reservaId: string;
    lines: InvoiceLine[];
    totalCents: number;
    currency: string;
    idempotencyKey?: string;
  }): Promise<IssueInvoiceResponse> {
    try {
      return await firstValueFrom(
        this.service.issueInvoice({
          idempotencyKey: data.idempotencyKey ?? uuidv4(),
          idPago: data.idPago,
          clienteId: data.clienteId,
          reservaId: data.reservaId,
          lines: data.lines,
          totalCents: data.totalCents,
          currency: data.currency,
        }),
      );
    } catch (error) {
      throw this.toDomainError(error, FinanceUnavailableError);
    }
  }

  async refundPayment(data: {
    idPago: string;
    amountCents: number;
    reason: string;
    idempotencyKey?: string;
  }): Promise<RefundPaymentResult> {
    try {
      const response = await firstValueFrom(
        this.service.refundPayment({
          idempotencyKey: data.idempotencyKey ?? uuidv4(),
          idPago: data.idPago,
          amountCents: data.amountCents,
          reason: data.reason,
        }),
      );
      return { ...response, unimplemented: false };
    } catch (error) {
      const grpcError = error as { code?: number; message?: string };
      if (grpcError.code === status.UNIMPLEMENTED) {
        return { unimplemented: true, message: grpcError.message ?? 'RefundPayment no implementado' };
      }
      throw this.toDomainError(error, FinanceUnavailableError);
    }
  }

  async getPaymentByReservaId(reservaId: string): Promise<{ idPago: string; amountCents: number; status: string } | null> {
    try {
      const response = await firstValueFrom(this.service.getPaymentByReservaId({ reservaId }));
      const idPago = response.idPago ?? response.id_pago;
      const amountCents = response.amountCents ?? response.amount_cents;
      if (!idPago || typeof amountCents !== 'number') return null;
      return { idPago, amountCents, status: response.status };
    } catch (error) {
      const grpcError = error as { code?: number };
      // NOT_FOUND es esperado si la reserva no tiene pago todavía
      if (grpcError.code === status.NOT_FOUND) return null;
      throw this.toDomainError(error, FinanceUnavailableError);
    }
  }

  private toDomainError(error: unknown, ErrorClass: new (message: string) => Error): Error {
    const grpcError = error as { code?: number; message?: string };
    const message = grpcError.message ?? 'Error de finanzas gRPC';
    if (grpcError.code === status.UNAVAILABLE || grpcError.code === status.DEADLINE_EXCEEDED) {
      return new FinanceUnavailableError(message);
    }
    return error instanceof Error ? error : new ErrorClass(message);
  }
}
