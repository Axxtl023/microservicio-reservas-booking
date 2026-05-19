import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, Logger, HttpStatus } from '@nestjs/common';
import type { CheckoutInput, CheckoutResult, IReservasService } from './interfaces/i-reservas.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { ReservaDataMapper } from '../../data-management/mappers/reserva.data-mapper';
import type { ReservaDataModel } from '../../data-management/models/reserva.data-model';
import { FinanceClient, type IssueInvoiceResponse, type ProcessPaymentResponse } from '../grpc-clients/finance.client';
import {
  BookingItem,
  IntegrationClient,
  ProviderType,
  ReservaNoDisponibleError,
  type CreateRemoteReservationResponse,
} from '../grpc-clients/integration.client';
import { RESERVA_STATUS, type ReservaStatus } from './constants/reserva-status.constants';
import { v4 as uuidv4 } from 'uuid';

interface CreatedRemoteReservation {
  detalleId: string;
  type: ProviderType;
  remoteReservationId: string;
  providerReservationCode: string | null;
}

type SagaIdempotencyKeys = Map<string, string>;

export class CheckoutSagaException extends Error {
  constructor(
    readonly httpStatus: HttpStatus,
    readonly estado: ReservaStatus | null,
    readonly reservaId: string | null,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ReservasService implements IReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    @Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork,
    private readonly integrationClient: IntegrationClient,
    private readonly financeClient: FinanceClient,
  ) {}

  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const correlationId = input.idCarrito;
    this.logger.log(`[${correlationId}] Checkout iniciado`);

    const carrito = await this.uow.carritosRepository.findById(input.idCarrito);
    if (!carrito || carrito.estado !== 'ACTIVO' || carrito.id_cliente !== input.idCliente) {
      throw new BadRequestException('Carrito no disponible para checkout');
    }

    const cartItems = carrito.items_carrito.filter((item) => item.id_producto_externo);
    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    const bookingItems = cartItems.map((item): BookingItem => ({
      itemId: item.id_producto_externo!,
      type: ProviderType.VEHICLE,
      clientId: input.idCliente,
      amountCents: this.decimalToCents(item.precio_unitario),
      vehicle: {
        vehiculoId: item.id_producto_externo!,
        agenciaId: input.agenciaId,
        fechaInicio: this.toProtoTimestamp(input.fechaInicio),
        fechaFin: this.toProtoTimestamp(input.fechaFin),
      },
    }));

    try {
      this.logger.log(`[${correlationId}] Paso 4: verificando disponibilidad gRPC`);
      await this.integrationClient.checkBatchAvailability(bookingItems);
    } catch (error) {
      if (error instanceof ReservaNoDisponibleError) {
        throw new CheckoutSagaException(HttpStatus.UNPROCESSABLE_ENTITY, null, null, error.message);
      }
      throw error;
    }

    this.logger.log(`[${correlationId}] Paso 5: creando reserva local en transacción`);
    const reservaEntity = await this.uow.convertirCarritoAReservaGrpcAtomic(input.idCarrito, input.idCliente);
    const reservaId = reservaEntity.id;
    const createdRemoteReservations: CreatedRemoteReservation[] = [];
    const idempotencyKeys: SagaIdempotencyKeys = new Map();
    let payment: ProcessPaymentResponse | null = null;

    try {
      this.logger.log(`[${correlationId}] Paso 6: creando reservas remotas`);
      for (let index = 0; index < reservaEntity.detalles_reserva.length; index += 1) {
        const detalle = reservaEntity.detalles_reserva[index];
        const item = bookingItems[index];
        const idempotencyKey = this.getSagaIdempotencyKey(idempotencyKeys, `create_remote:${detalle.id}`);
        const remote = await this.integrationClient.createRemoteReservation(item, idempotencyKey);
        const remoteReservation = this.toCreatedRemoteReservation(detalle.id, remote);
        await this.uow.detallesReservaRepository.updateRemoteReservation({
          id: detalle.id,
          id_externo: remoteReservation.remoteReservationId,
          id_externo_codigo: remoteReservation.providerReservationCode,
        });
        createdRemoteReservations.push(remoteReservation);
      }
    } catch (error) {
      await this.compensateAfterStep6(reservaId, createdRemoteReservations, idempotencyKeys, error);
    }

    try {
      this.logger.log(`[${correlationId}] Paso 7: procesando pago`);
      payment = await this.financeClient.processPayment({
        clienteId: input.idCliente,
        amountCents: this.decimalToCents(carrito.total),
        currency: input.currency,
        metodoPagoId: input.metodoPagoId,
        reservaId,
        idempotencyKey: this.getSagaIdempotencyKey(idempotencyKeys, `process_payment:${reservaId}`),
      });
    } catch (error) {
      await this.compensateAfterStep7(reservaId, createdRemoteReservations, idempotencyKeys, error);
    }

    let invoice: IssueInvoiceResponse;
    try {
      this.logger.log(`[${correlationId}] Paso 8: emitiendo factura`);
      invoice = await this.financeClient.issueInvoice({
        idPago: this.getIdPago(payment),
        clienteId: input.idCliente,
        reservaId,
        lines: cartItems.map((item) => ({
          description: item.nombre_producto ?? item.id_producto_externo ?? 'Reserva',
          quantity: item.cantidad ?? 1,
          unitPriceCents: this.decimalToCents(item.precio_unitario),
        })),
        totalCents: this.decimalToCents(carrito.total),
        currency: input.currency,
        idempotencyKey: this.getSagaIdempotencyKey(idempotencyKeys, `issue_invoice:${reservaId}`),
      });
    } catch (error) {
      await this.compensateAfterStep8(reservaId, createdRemoteReservations, payment, this.decimalToCents(carrito.total), idempotencyKeys, error);
    }

    const confirmedRemoteReservations: CreatedRemoteReservation[] = [];
    try {
      this.logger.log(`[${correlationId}] Paso 9: confirmando reservas remotas`);
      for (const remote of createdRemoteReservations) {
        const idempotencyKey = this.getSagaIdempotencyKey(idempotencyKeys, `confirm_remote:${remote.detalleId}`);
        await this.integrationClient.confirmRemoteReservation(remote.type, remote.remoteReservationId, idempotencyKey);
        confirmedRemoteReservations.push(remote);
      }
    } catch (error) {
      await this.compensateAfterStep9(
        reservaId,
        confirmedRemoteReservations,
        payment,
        this.decimalToCents(carrito.total),
        idempotencyKeys,
        error,
      );
    }

    this.logger.log(`[${correlationId}] Paso 10: confirmando reserva local`);
    const confirmed = await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.CONFIRMADA);
    return {
      reserva: ReservaDataMapper.toDataModel(confirmed),
      factura: invoice!,
    };
  }

  async getMisReservas(idCliente: string): Promise<ReservaDataModel[]> {
    const entities = await this.uow.reservasRepository.findByCliente(idCliente);
    return ReservaDataMapper.toDataModelList(entities);
  }

  async getAllReservasPaginated(filtros: { search?: string; page: number; limit: number }): Promise<{ data: ReservaDataModel[]; total: number; page: number; limit: number }> {
    const result = await this.uow.reservasRepository.findAllPaginated(filtros);
    return {
      data: ReservaDataMapper.toDataModelList(result.data),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getById(id: string): Promise<ReservaDataModel> {
    const entity = await this.uow.reservasRepository.findById(id);
    if (!entity) throw new NotFoundException(`Reserva con id ${id} no encontrada`);
    return ReservaDataMapper.toDataModel(entity);
  }

  async updateEstado(id: string, status: string): Promise<ReservaDataModel> {
    await this.getById(id);
    const entity = await this.uow.reservasRepository.updateEstado(id, status);
    return ReservaDataMapper.toDataModel(entity);
  }

  async cancelarMiReserva(id: string, idCliente: string, rol: string): Promise<ReservaDataModel> {
    const entity = await this.uow.reservasRepository.findById(id);
    if (!entity) throw new NotFoundException(`Reserva con id ${id} no encontrada`);
    if (rol.toLowerCase() !== 'admin' && entity.id_cliente !== idCliente) {
      throw new ForbiddenException('No tienes permiso para cancelar esta reserva');
    }
    const statusUpper = (entity.status ?? '').toUpperCase();
    if (statusUpper === RESERVA_STATUS.CANCELADA || statusUpper === RESERVA_STATUS.COMPLETADA) {
      throw new BadRequestException('La reserva no puede ser cancelada en su estado actual');
    }
    const updated = await this.uow.reservasRepository.updateEstado(id, RESERVA_STATUS.CANCELADA);
    return ReservaDataMapper.toDataModel(updated);
  }

  private async compensateAfterStep6(
    reservaId: string,
    createdRemoteReservations: CreatedRemoteReservation[],
    idempotencyKeys: SagaIdempotencyKeys,
    cause: unknown,
  ): Promise<never> {
    await this.cancelRemoteReservations(createdRemoteReservations, 'CREATE_REMOTE_RESERVATION_FAILED', idempotencyKeys);
    await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.FALLIDA_PROVEEDOR);
    throw new CheckoutSagaException(
      HttpStatus.BAD_GATEWAY,
      RESERVA_STATUS.FALLIDA_PROVEEDOR,
      reservaId,
      this.errorMessage(cause, 'Falló la reserva con proveedor externo'),
    );
  }

  private async compensateAfterStep7(
    reservaId: string,
    createdRemoteReservations: CreatedRemoteReservation[],
    idempotencyKeys: SagaIdempotencyKeys,
    cause: unknown,
  ): Promise<never> {
    await this.cancelRemoteReservations(createdRemoteReservations, 'PAYMENT_FAILED', idempotencyKeys);
    await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.FALLIDA_PAGO);
    throw new CheckoutSagaException(
      HttpStatus.PAYMENT_REQUIRED,
      RESERVA_STATUS.FALLIDA_PAGO,
      reservaId,
      this.errorMessage(cause, 'Falló el procesamiento del pago'),
    );
  }

  private async compensateAfterStep8(
    reservaId: string,
    createdRemoteReservations: CreatedRemoteReservation[],
    payment: ProcessPaymentResponse | null,
    amountCents: number,
    idempotencyKeys: SagaIdempotencyKeys,
    cause: unknown,
  ): Promise<never> {
    await this.tryRefundPayment(reservaId, payment, amountCents, 'INVOICE_FAILED', idempotencyKeys);
    await this.cancelRemoteReservations(createdRemoteReservations, 'INVOICE_FAILED', idempotencyKeys);
    await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.FALLIDA_FACTURACION);
    throw new CheckoutSagaException(
      HttpStatus.BAD_GATEWAY,
      RESERVA_STATUS.FALLIDA_FACTURACION,
      reservaId,
      this.errorMessage(cause, 'Falló la facturación'),
    );
  }

  private async compensateAfterStep9(
    reservaId: string,
    confirmedRemoteReservations: CreatedRemoteReservation[],
    payment: ProcessPaymentResponse | null,
    amountCents: number,
    idempotencyKeys: SagaIdempotencyKeys,
    cause: unknown,
  ): Promise<never> {
    await this.tryRefundPayment(reservaId, payment, amountCents, 'CONFIRMATION_FAILED', idempotencyKeys);
    await this.cancelRemoteReservations(confirmedRemoteReservations, 'CONFIRMATION_FAILED', idempotencyKeys);
    await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.FALLIDA_CONFIRMACION);
    throw new CheckoutSagaException(
      HttpStatus.BAD_GATEWAY,
      RESERVA_STATUS.FALLIDA_CONFIRMACION,
      reservaId,
      this.errorMessage(cause, 'Falló la confirmación con proveedor externo'),
    );
  }

  private async cancelRemoteReservations(
    reservations: CreatedRemoteReservation[],
    reason: string,
    idempotencyKeys: SagaIdempotencyKeys,
  ): Promise<void> {
    for (const remote of [...reservations].reverse()) {
      try {
        const idempotencyKey = this.getSagaIdempotencyKey(idempotencyKeys, `cancel_remote:${reason}:${remote.detalleId}`);
        await this.integrationClient.cancelRemoteReservation(remote.type, remote.remoteReservationId, reason, idempotencyKey);
      } catch (error) {
        this.logger.error(`Compensación CancelRemoteReservation falló: ${this.errorMessage(error, 'error desconocido')}`);
      }
    }
  }

  private async tryRefundPayment(
    reservaId: string,
    payment: ProcessPaymentResponse | null,
    amountCents: number,
    reason: string,
    idempotencyKeys: SagaIdempotencyKeys,
  ): Promise<void> {
    if (!payment) return;
    const idPago = this.getIdPago(payment);
    try {
      const refund = await this.financeClient.refundPayment({
        idPago,
        amountCents,
        reason,
        idempotencyKey: this.getSagaIdempotencyKey(idempotencyKeys, `refund_payment:${reason}:${idPago}`),
      });
      if (refund.unimplemented) {
        this.logger.warn(`RefundPayment pendiente para pago ${idPago}: ${refund.message}`);
        await this.uow.auditoriaRepository.create({
          accion: 'COMPENSATION_PENDING_REFUND',
          tabla: 'reservas',
          detalles: JSON.stringify({ reservaId, idPago, amountCents, reason, message: refund.message }),
        });
      }
    } catch (error) {
      this.logger.error(`Compensación RefundPayment falló: ${this.errorMessage(error, 'error desconocido')}`);
    }
  }

  private toCreatedRemoteReservation(
    detalleId: string,
    response: CreateRemoteReservationResponse,
  ): CreatedRemoteReservation {
    const remoteReservationId = response.remoteReservationId ?? response.remote_reservation_id;
    if (!remoteReservationId) {
      throw new Error('CreateRemoteReservation no devolvió remote_reservation_id');
    }
    return {
      detalleId,
      type: response.type,
      remoteReservationId,
      providerReservationCode: response.providerReservationCode ?? response.provider_reservation_code ?? null,
    };
  }

  private getIdPago(payment: ProcessPaymentResponse | null): string {
    const idPago = payment?.idPago ?? payment?.id_pago;
    if (!idPago) throw new Error('ProcessPayment no devolvió id_pago');
    return idPago;
  }

  private toProtoTimestamp(value: string): { seconds: number; nanos: number } {
    return { seconds: Math.floor(new Date(value).getTime() / 1000), nanos: 0 };
  }

  private decimalToCents(value: unknown): number {
    return Math.round(Number(value ?? 0) * 100);
  }

  private getSagaIdempotencyKey(idempotencyKeys: SagaIdempotencyKeys, operation: string): string {
    const existingKey = idempotencyKeys.get(operation);
    if (existingKey) return existingKey;

    const idempotencyKey = uuidv4();
    idempotencyKeys.set(operation, idempotencyKey);
    return idempotencyKey;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
