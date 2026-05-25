import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import type { ICarritoService } from './interfaces/i-carrito.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { CarritoDataMapper } from '../../data-management/mappers/carrito.data-mapper';
import type { CarritoDataModel } from '../../data-management/models/carrito.data-model';

@Injectable()
export class CarritoService implements ICarritoService {
  constructor(@Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork) {}

  async getCarritoActivo(idCliente: string): Promise<CarritoDataModel> {
    let carrito = await this.uow.carritosRepository.findActivoByCliente(idCliente);
    if (!carrito) {
      carrito = await this.uow.carritosRepository.create(idCliente);
    }
    return CarritoDataMapper.toDataModel(carrito);
  }

  async addItem(idCliente: string, idProveedor: string, idProductoExterno: string, nombreProducto: string, cantidad: number, precioUnitario: number, metadata?: Record<string, unknown>): Promise<CarritoDataModel> {
    const proveedor = await this.uow.proveedoresRepository.findById(idProveedor);
    if (!proveedor) {
      throw new BadRequestException(`Proveedor ${idProveedor} no existe`);
    }
    if (proveedor.activo === false) {
      throw new BadRequestException(`Proveedor ${proveedor.nombre} está inactivo y no acepta nuevas reservas`);
    }
    const carrito = await this.uow.addItemToCarritoAtomic({ idCliente, idProveedor, idProductoExterno, nombreProducto, cantidad, precioUnitario, metadata });
    return CarritoDataMapper.toDataModel(carrito);
  }

  async updateItemCantidad(idItem: string, cantidad: number): Promise<CarritoDataModel> {
    const item = await this.uow.itemsCarritoRepository.findById(idItem);
    if (!item) throw new NotFoundException(`Item ${idItem} no encontrado`);
    const carrito = await this.uow.updateItemCantidadAtomic(idItem, cantidad);
    return CarritoDataMapper.toDataModel(carrito);
  }

  async removeItem(idItem: string): Promise<CarritoDataModel> {
    const item = await this.uow.itemsCarritoRepository.findById(idItem);
    if (!item) throw new NotFoundException(`Item ${idItem} no encontrado`);
    const carrito = await this.uow.removeItemAtomic(idItem);
    return CarritoDataMapper.toDataModel(carrito);
  }
}
