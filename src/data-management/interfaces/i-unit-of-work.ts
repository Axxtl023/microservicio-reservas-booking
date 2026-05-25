import type { ICategoriasRepository } from '../../data-access/repositories/interfaces/i-categorias.repository';
import type { IProveedoresRepository } from '../../data-access/repositories/interfaces/i-proveedores.repository';
import type { ICarritosRepository, CarritoConItems } from '../../data-access/repositories/interfaces/i-carritos.repository';
import type { IItemsCarritoRepository } from '../../data-access/repositories/interfaces/i-items-carrito.repository';
import type { IReservasRepository, ReservaConDetalles } from '../../data-access/repositories/interfaces/i-reservas.repository';
import type { IDetallesReservaRepository } from '../../data-access/repositories/interfaces/i-detalles-reserva.repository';
import type { IAuditoriaRepository } from '../../data-access/repositories/interfaces/i-auditoria.repository';

export interface AddItemAtomicData {
  idCliente: string;
  idProveedor: string;
  idProductoExterno: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  metadata?: Record<string, unknown>;
}

export interface IUnitOfWork {
  readonly categoriasRepository: ICategoriasRepository;
  readonly proveedoresRepository: IProveedoresRepository;
  readonly carritosRepository: ICarritosRepository;
  readonly itemsCarritoRepository: IItemsCarritoRepository;
  readonly reservasRepository: IReservasRepository;
  readonly detallesReservaRepository: IDetallesReservaRepository;
  readonly auditoriaRepository: IAuditoriaRepository;

  addItemToCarritoAtomic(data: AddItemAtomicData): Promise<CarritoConItems>;
  updateItemCantidadAtomic(idItem: string, cantidad: number): Promise<CarritoConItems>;
  removeItemAtomic(idItem: string): Promise<CarritoConItems>;
  convertirCarritoAReservaAtomic(idCarrito: string, idCliente: string): Promise<ReservaConDetalles>;
  convertirCarritoAReservaGrpcAtomic(idCarrito: string, idCliente: string): Promise<ReservaConDetalles>;
}

export const IUNIT_OF_WORK = 'IUNIT_OF_WORK';
