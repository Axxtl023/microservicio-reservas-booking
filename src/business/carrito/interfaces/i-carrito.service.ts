import type { CarritoDataModel } from '../../../data-management/models/carrito.data-model';

export interface ICarritoService {
  getCarritoActivo(idCliente: string): Promise<CarritoDataModel>;
  addItem(idCliente: string, idProductoExterno: string, nombreProducto: string, cantidad: number, precioUnitario: number): Promise<CarritoDataModel>;
  updateItemCantidad(idItem: string, cantidad: number): Promise<CarritoDataModel>;
  removeItem(idItem: string): Promise<CarritoDataModel>;
}

export const ICARRITO_SERVICE = 'ICARRITO_SERVICE';
