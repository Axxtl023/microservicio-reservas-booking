import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SagaService } from '../event-bus/saga/saga.service';
import { CommandPublishers } from '../event-bus/publishers/command-publishers';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { ReservaDataMapper } from '../../data-management/mappers/reserva.data-mapper';
import type { ReservaDataModel } from '../../data-management/models/reserva.data-model';
import type { ProveedorTipo } from '../../data-management/models/proveedor.data-model';
import type { ProviderType } from '../event-bus/event-types';
import { RESERVA_STATUS } from './constants/reserva-status.constants';

const tipoToProvider: Record<ProveedorTipo, ProviderType> = {
  VEHICLE: 'VEHICLE',
  FLIGHT: 'FLIGHT',
  HOTEL: 'HOTEL',
  ATTRACTION: 'TOUR',
};

/**
 * Cancelación V2 — saga corta:
 * 1. Publica integration.reservation.cancel.requested por cada detalle
 * 2. Si hay pago previo, publica payment.refund.requested
 * 3. Espera saga terminal o timeout
 *
 * NOTA: la saga de cancelación reusa la misma row de saga_state si existe (es
 * UNIQUE por reservaId). Si una reserva fue checkout-eada y ahora se cancela,
 * el saga_state previo está en COMPLETED — re-creamos uno nuevo con saga_type
 * CANCELLATION en una row distinta. Pero como saga_state.reserva_id es UNIQUE,
 * acá borramos la previa antes (saga de checkout ya terminó, no la perdemos
 * lógicamente).
 *
 * Alternativa: separar saga_state en dos tablas (checkout_sagas + cancellation_sagas).
 * Por ahora el approach pragmático es upsert con cleanup del state anterior.
 */
@Injectable()
export class CancelV2Service {
  private readonly logger = new Logger(CancelV2Service.name);
  private readonly timeoutMs = Number(process.env.SAGA_STEP_TIMEOUT_S ?? 30) * 1000;

  constructor(
    @Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork,
    private readonly prisma: PrismaService,
    private readonly saga: SagaService,
    private readonly publishers: CommandPublishers,
  ) {}

  async execute(reservaId: string, idCliente: string, rol: string): Promise<ReservaDataModel> {
    const correlationId = randomUUID();
    this.logger.log(`[v2 ${correlationId}] cancel start reserva=${reservaId}`);

    const entity = await this.uow.reservasRepository.findById(reservaId);
    if (!entity) throw new NotFoundException(`Reserva con id ${reservaId} no encontrada`);
    if (rol.toLowerCase() !== 'admin' && entity.id_cliente !== idCliente) {
      throw new ForbiddenException('No tienes permiso para cancelar esta reserva');
    }
    const statusUpper = (entity.status ?? '').toUpperCase();
    if (statusUpper === RESERVA_STATUS.CANCELADA || statusUpper === RESERVA_STATUS.COMPLETADA) {
      throw new BadRequestException('La reserva no puede ser cancelada en su estado actual');
    }

    const detalles = await this.uow.detallesReservaRepository.findByReserva(reservaId);
    const cancellables = detalles.filter((d) => d.id_externo);
    if (cancellables.length === 0) {
      // Nada que cancelar externamente, cierre directo
      const updated = await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.CANCELADA);
      return ReservaDataMapper.toDataModel(updated);
    }

    const providersById = await this.getProvidersById(
      cancellables.map((d) => (d as { id_proveedor?: string | null }).id_proveedor ?? null),
    );

    // Limpiar saga previa (checkout) si existía, para poder crear la de CANCELLATION.
    await this.prisma.saga_state.deleteMany({ where: { reserva_id: reservaId } });

    let sagaId!: string;
    await this.prisma.$transaction(async (tx) => {
      const saga = await this.saga.createTx(tx, {
        reservaId,
        sagaType: 'CANCELLATION',
        initialStep: 'COMPENSATING',
        totalItems: cancellables.length,
        correlationId,
        context: { motivo: 'USER_CANCELLATION' },
      });
      sagaId = saga.id;

      await this.publishers.sagaStarted(
        { tx, correlationId },
        { sagaId: saga.id, reservaId, sagaType: 'CANCELLATION' },
      );

      for (const det of cancellables) {
        const providerId = (det as { id_proveedor?: string | null }).id_proveedor!;
        const provider = providersById.get(providerId)!;
        const providerType = tipoToProvider[provider.tipo as ProveedorTipo];
        if (!providerType) continue;
        await this.publishers.cancelReservation(
          { tx, correlationId },
          {
            reservaId,
            itemId: det.id,
            providerId,
            providerType,
            externalId: det.id_externo!,
            motivo: 'USER_CANCELLATION',
          },
        );
      }
    });

    // Esperar a que se cancelen todos. Acá el "terminal" lo decidimos por
    // items_cancelled >= total_items (no avanzamos current_step en consumers
    // de cancelled — sólo incrementamos contador).
    const cancelledTerminal = await this.waitForAllCancelled(sagaId, this.timeoutMs);
    if (!cancelledTerminal) {
      throw new GatewayTimeoutException(
        `Cancelación timeout — consultá GET /api/v1/reservas/${reservaId} para el estado final.`,
      );
    }

    const updated = await this.uow.reservasRepository.updateEstado(reservaId, RESERVA_STATUS.CANCELADA);
    return ReservaDataMapper.toDataModel(updated);
  }

  private async waitForAllCancelled(sagaId: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const saga = await this.saga.findById(sagaId);
      if (!saga) return false;
      if (saga.items_cancelled >= saga.total_items) return true;
      if (saga.current_step === 'FAILED') return false;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  private async getProvidersById(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    const map = new Map();
    for (const id of uniq) {
      const p = await this.uow.proveedoresRepository.findById(id);
      if (p) map.set(id, p);
    }
    return map;
  }
}
