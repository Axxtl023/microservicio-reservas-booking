import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IProveedoresService } from './interfaces/i-proveedores.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { ProveedorDataMapper } from '../../data-management/mappers/proveedor.data-mapper';
import type { ProveedorDataModel } from '../../data-management/models/proveedor.data-model';

@Injectable()
export class ProveedoresService implements IProveedoresService {
  constructor(@Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork) {}

  async findAll(search?: string): Promise<ProveedorDataModel[]> {
    const entities = await this.uow.proveedoresRepository.findAll(search);
    return ProveedorDataMapper.toDataModelList(entities);
  }

  async findById(id: string): Promise<ProveedorDataModel> {
    const entity = await this.uow.proveedoresRepository.findById(id);
    if (!entity) throw new NotFoundException(`Proveedor con id ${id} no encontrado`);
    return ProveedorDataMapper.toDataModel(entity);
  }

  async create(data: { nombre: string; url_api_base: string; activo?: boolean }): Promise<ProveedorDataModel> {
    const entity = await this.uow.proveedoresRepository.create(data);
    return ProveedorDataMapper.toDataModel(entity);
  }

  async update(id: string, data: { nombre?: string; url_api_base?: string; activo?: boolean }): Promise<ProveedorDataModel> {
    await this.findById(id);
    const entity = await this.uow.proveedoresRepository.update(id, data);
    return ProveedorDataMapper.toDataModel(entity);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.uow.proveedoresRepository.delete(id);
  }
}
