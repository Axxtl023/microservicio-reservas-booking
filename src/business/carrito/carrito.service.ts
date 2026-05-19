import { Injectable, Inject, NotFoundException } from '@nestjs/common';
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

  async addItem(idCliente: string, idProductoExterno: string, nombreProducto: string, cantidad: number, precioUnitario: number): Promise<CarritoDataModel> {
    const carrito = await this.uow.addItemToCarritoAtomic({ idCliente, idProductoExterno, nombreProducto, cantidad, precioUnitario });
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
