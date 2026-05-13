import type { Prisma } from '@prisma/client';

export const INCLUDE_DETALLES_PROVEEDOR = {
  detalles_reserva: {
    include: {
      proveedores: true,
    },
  },
} satisfies Prisma.reservasFindManyArgs['include'];

export type ReservaConDetalles = Prisma.reservasGetPayload<{
  include: typeof INCLUDE_DETALLES_PROVEEDOR;
}>;

export interface ReservaFiltros {
  search?: string;
  page: number;
  limit: number;
}

export interface IReservasRepository {
  findById(id: string): Promise<ReservaConDetalles | null>;
  findByCliente(idCliente: string): Promise<ReservaConDetalles[]>;
  findAllPaginated(filtros: ReservaFiltros): Promise<{ data: ReservaConDetalles[]; total: number; page: number; limit: number }>;
  updateEstado(id: string, status: string): Promise<ReservaConDetalles>;
}

export const IRESERVAS_REPOSITORY = 'IRESERVAS_REPOSITORY';
