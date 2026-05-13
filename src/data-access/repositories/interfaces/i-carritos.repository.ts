import type { Prisma } from '@prisma/client';

export const INCLUDE_ITEMS_CARRITO = {
  items_carrito: true,
} satisfies Prisma.carritosFindManyArgs['include'];

export type CarritoConItems = Prisma.carritosGetPayload<{
  include: typeof INCLUDE_ITEMS_CARRITO;
}>;

export interface ICarritosRepository {
  findActivoByCliente(idCliente: string): Promise<CarritoConItems | null>;
  findById(id: string): Promise<CarritoConItems | null>;
  create(idCliente: string): Promise<CarritoConItems>;
  updateTotal(id: string, total: number): Promise<void>;
  updateEstado(id: string, estado: string): Promise<void>;
}

export const ICARRITOS_REPOSITORY = 'ICARRITOS_REPOSITORY';
