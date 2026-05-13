import type { detalles_reserva } from '@prisma/client';

export type { detalles_reserva as DetalleReservaPrisma };

export interface IDetallesReservaRepository {
  findByReserva(idReserva: string): Promise<detalles_reserva[]>;
  create(data: {
    id_reserva: string;
    id_externo: string;
    id_proveedor?: string;
    cantidad: number;
    precio_unitario: number;
  }): Promise<detalles_reserva>;
}

export const IDETALLES_RESERVA_REPOSITORY = 'IDETALLES_RESERVA_REPOSITORY';
