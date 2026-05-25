import type { CarritoConItems } from '../../data-access/repositories/interfaces/i-carritos.repository';
import type { CarritoDataModel, ItemCarritoDataModel } from '../models/carrito.data-model';

export class CarritoDataMapper {
  static toDataModel(entity: CarritoConItems): CarritoDataModel {
    return {
      id: entity.id,
      idCliente: entity.id_cliente ?? null,
      estado: entity.estado ?? 'ACTIVO',
      total: Number(entity.total),
      createdAt: entity.created_at ?? null,
      items: entity.items_carrito.map((item): ItemCarritoDataModel => ({
        id: item.id,
        idCarrito: item.id_carrito ?? null,
        idProveedor: (item as { id_proveedor?: string | null }).id_proveedor ?? null,
        idProductoExterno: item.id_producto_externo ?? null,
        nombreProducto: item.nombre_producto ?? null,
        cantidad: item.cantidad ?? 1,
        precioUnitario: Number(item.precio_unitario),
        metadata: (item as { metadata?: Record<string, unknown> | null }).metadata ?? null,
        createdAt: item.created_at ?? null,
      })),
    };
  }
}
