import type { items_carrito } from '@prisma/client';

export type { items_carrito as ItemCarritoPrisma };

export interface IItemsCarritoRepository {
  findById(id: string): Promise<items_carrito | null>;
  findByCarritoAndProducto(idCarrito: string, idProductoExterno: string): Promise<items_carrito | null>;
  create(data: { id_carrito: string; id_producto_externo: string; cantidad: number; precio_unitario: number }): Promise<items_carrito>;
  updateCantidad(id: string, cantidad: number): Promise<items_carrito>;
  delete(id: string): Promise<void>;
}

export const IITEMS_CARRITO_REPOSITORY = 'IITEMS_CARRITO_REPOSITORY';
