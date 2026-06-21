import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  GatewayTimeoutException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SagaService } from '../event-bus/saga/saga.service';
import { CommandPublishers } from '../event-bus/publishers/command-publishers';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { ReservaDataMapper } from '../../data-management/mappers/reserva.data-mapper';
import type { CheckoutInput, CheckoutResult } from './interfaces/i-reservas.service';
import type { IssueInvoiceResponse } from '../grpc-clients/finance.client';
import type { ProveedorTipo } from '../../data-management/models/proveedor.data-model';
import type { ProveedorPrisma } from '../../data-access/repositories/interfaces/i-proveedores.repository';
import type { ProviderType } from '../event-bus/event-types';
import { RESERVA_STATUS } from './constants/reserva-status.constants';
import { CheckoutSagaException } from './reservas.service';

const tipoToProvider: Record<ProveedorTipo, ProviderType> = {
  VEHICLE: 'VEHICLE',
  FLIGHT: 'FLIGHT',
  HOTEL: 'HOTEL',
  ATTRACTION: 'TOUR',
};

/**
 * Checkout V2 — coreografía por EventBus.
 *
 * Flujo:
 * 1. Valida carrito (igual que V1)
 * 2. Crea reserva local en transacción (reusa UoW)
 * 3. En otra transacción: crea saga PENDING + publica 1 create command por item
 * 4. Bloquea esperando que la saga llegue a estado terminal (COMPLETED/FAILED/timeout)
 * 5. Construye respuesta byte-idéntica a V1 (reserva + factura desde saga.context)
 *
 * El HTTP request se mantiene síncrono — mismo contrato que V1 frente al FE.
 * Toggle vía env `CHECKOUT_MODE=v2`.
 */
@Injectable()
export class CheckoutV2Service {
  private readonly logger = new Logger(CheckoutV2Service.name);
  private readonly timeoutMs = Number(process.env.SAGA_STEP_TIMEOUT_S ?? 30) * 1000;

  constructor(
    @Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork,
    private readonly prisma: PrismaService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
  ) {}

  async execute(input: CheckoutInput): Promise<CheckoutResult> {
    const correlationId = randomUUID();
    this.logger.log(`[v2 ${correlationId}] checkout start carrito=${input.idCarrito}`);

    // ── Validación carrito ────────────────────────────────────────────────────
    const carrito = await this.uow.carritosRepository.findById(input.idCarrito);
    if (!carrito || carrito.estado !== 'ACTIVO' || carrito.id_cliente !== input.idCliente) {
      throw new BadRequestException('Carrito no disponible para checkout');
    }
    const cartItems = carrito.items_carrito.filter((it) => it.id_producto_externo);
    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    const providersById = await this.getProvidersById(
      cartItems.map((it) => (it as { id_proveedor?: string | null }).id_proveedor ?? null),
    );

    // ── Crear reserva local (reusa transacción existente) ─────────────────────
    const reservaEntity = await this.uow.convertirCarritoAReservaGrpcAtomic(input.idCarrito, input.idCliente);
    const reservaId = reservaEntity.id;
    const totalCents = this.decimalToCents(carrito.total);

    // ── Crear saga + publicar create commands en transacción ──────────────────
    let sagaId: string;
    try {
      await this.prisma.$transaction(async (tx) => {
        const saga = await this.saga.createTx(tx, {
          reservaId,
          sagaType: 'CHECKOUT',
          initialStep: 'CREATING_REMOTE_RESERVATIONS',
          totalItems: reservaEntity.detalles_reserva.length,
          correlationId,
          context: {
            metodoPagoId: input.metodoPagoId,
            currency: input.currency,
            monto: Number(carrito.total),
            totalCents,
            idCliente: input.idCliente,
          },
        });
        sagaId = saga.id;

        await this.publishers.sagaStarted(
          { tx, correlationId },
          { sagaId: saga.id, reservaId, sagaType: 'CHECKOUT' },
        );

        // Publish 1 create command por detalle de reserva
        for (let i = 0; i < reservaEntity.detalles_reserva.length; i += 1) {
          const detalle = reservaEntity.detalles_reserva[i];
          const cartItem = cartItems[i];
          const providerId = (cartItem as { id_proveedor?: string | null }).id_proveedor!;
          const provider = providersById.get(providerId)!;
          const providerType = tipoToProvider[provider.tipo as ProveedorTipo];
          if (!providerType) {
            throw new BadRequestException(`Provider ${provider.tipo} no mapeable a ProviderType`);
          }
          const metadata = this.buildMetadata(cartItem, providerType, input);
          await this.publishers.createReservation(
            { tx, correlationId },
            {
              reservaId,
              itemId: detalle.id,
              providerId,
              providerType,
              quantity: cartItem.cantidad ?? 1,
              unitPrice: Number(cartItem.precio_unitario),
              currency: input.currency,
              metadata,
            },
          );
        }
      });
    } catch (err) {
      this.logger.error(`[v2 ${correlationId}] error creando saga: ${this.errorMessage(err)}`);
      await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.FALLIDA_PROVEEDOR);
      throw new CheckoutSagaException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        RESERVA_STATUS.FALLIDA_PROVEEDOR,
        reservaId,
        this.errorMessage(err),
      );
    }

    // ── Wait for terminal state (HTTP sync) ───────────────────────────────────
    this.logger.log(`[v2 ${correlationId}] esperando saga ${sagaId!} hasta ${this.timeoutMs}ms`);
    const terminal = await this.saga.waitForTerminalState(sagaId!, this.timeoutMs);

    if (!terminal) {
      this.logger.error(`[v2 ${correlationId}] TIMEOUT saga ${sagaId!}`);
      throw new GatewayTimeoutException(
        `Checkout timeout — el procesamiento sigue. Consultá GET /api/v1/reservas/${reservaId} para el resultado final.`,
      );
    }

    if (terminal.current_step === 'FAILED' || terminal.current_step === 'COMPENSATED') {
      const msg = terminal.last_error ?? 'Checkout falló';
      throw new CheckoutSagaException(
        HttpStatus.BAD_GATEWAY,
        RESERVA_STATUS.FALLIDA_PROVEEDOR,
        reservaId,
        msg,
      );
    }

    // ── Éxito: armar response ─────────────────────────────────────────────────
    await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.CONFIRMADA);
    const confirmed = await this.uow.reservasRepository.findById(reservaId);
    if (!confirmed) {
      throw new Error(`reserva ${reservaId} desapareció post-COMPLETED`);
    }

    const ctx = (terminal.context ?? {}) as { invoice?: Partial<IssueInvoiceResponse> };
    const invoice: IssueInvoiceResponse = {
      idFactura: ctx.invoice?.idFactura,
      numeroFactura: ctx.invoice?.numeroFactura,
      status: 'EMITIDA',
      totalCents: ctx.invoice?.totalCents ?? totalCents,
      currency: input.currency,
    };

    return {
      reserva: ReservaDataMapper.toDataModel(confirmed),
      factura: invoice,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getProvidersById(ids: (string | null)[]): Promise<Map<string, ProveedorPrisma>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    const map = new Map<string, ProveedorPrisma>();
    for (const id of uniq) {
      const p = await this.uow.proveedoresRepository.findById(id);
      if (p) map.set(id, p);
    }
    return map;
  }

  /**
   * Construye el metadata que espera integracion para cada providerType.
   * Lee del `item.metadata` (fuente de verdad por-item) con fallback a campos
   * del input (compat).
   */
  private buildMetadata(
    item: { id: string; id_producto_externo: string | null; metadata?: unknown; cantidad?: number | null },
    type: ProviderType,
    input: CheckoutInput,
  ): Record<string, unknown> {
    const meta = (item.metadata ?? {}) as Record<string, unknown>;
    const readStr = (k: string, fb?: string): string | undefined => {
      const v = meta[k];
      if (typeof v === 'string' && v.length > 0) return v;
      return fb;
    };

    if (type === 'VEHICLE') {
      const fechaInicio = readStr('fechaInicio', input.fechaInicio);
      const fechaFin = readStr('fechaFin', input.fechaFin);
      if (!fechaInicio || !fechaFin) {
        throw new BadRequestException(`Item ${item.id} (vehicle) sin fechas`);
      }
      return {
        vehiculoId: item.id_producto_externo,
        clienteId: input.idCliente,
        agenciaId: readStr('agenciaId', input.agenciaId),
        fechaInicio,
        fechaFin,
      };
    }
    if (type === 'HOTEL') {
      const fechaInicio = readStr('fechaInicio', input.fechaInicio);
      const fechaFin = readStr('fechaFin', input.fechaFin);
      const alojamientoId = readStr('alojamientoId', item.id_producto_externo ?? undefined);
      const habitacionId = readStr('habitacionId');
      if (!alojamientoId || !habitacionId || !fechaInicio || !fechaFin) {
        throw new BadRequestException(`Item ${item.id} (hotel) metadata incompleto`);
      }
      return {
        alojamientoId,
        habitacionId,
        clienteId: input.idCliente,
        fechaInicio,
        fechaFin,
      };
    }
    if (type === 'FLIGHT') {
      const flightClassId = readStr('flightClassId');
      const passengers = meta.passengers as Array<Record<string, string>> | undefined;
      if (!flightClassId || !passengers?.length) {
        throw new BadRequestException(`Item ${item.id} (flight) metadata incompleto`);
      }
      return { flightClassId, passengers };
    }
    if (type === 'TOUR') {
      const slotId = readStr('slotId');
      const attractionId = readStr('attractionId');
      const productOptionId = readStr('productOptionId');
      const contactName = readStr('contactName');
      const contactEmail = readStr('contactEmail');
      const passengers = meta.passengers as Array<Record<string, string>> | undefined;
      if (!slotId || !attractionId || !productOptionId || !contactName || !contactEmail || !passengers?.length) {
        throw new BadRequestException(`Item ${item.id} (tour) metadata incompleto`);
      }
      return { slotId, attractionId, productOptionId, contactName, contactEmail, passengers };
    }
    throw new BadRequestException(`providerType ${String(type)} no soportado`);
  }

  private decimalToCents(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Math.round(n * 100);
  }

  private errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'unknown error';
  }
}
