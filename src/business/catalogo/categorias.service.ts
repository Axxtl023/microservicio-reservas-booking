import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import type { ICategoriasService } from './interfaces/i-categorias.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { CategoriaDataMapper } from '../../data-management/mappers/categoria.data-mapper';
import type { CategoriaDataModel } from '../../data-management/models/categoria.data-model';

@Injectable()
export class CategoriasService implements ICategoriasService {
  constructor(@Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork) {}

  async findAll(): Promise<CategoriaDataModel[]> {
    const entities = await this.uow.categoriasRepository.findAll();
    return CategoriaDataMapper.toDataModelList(entities);
  }

  async findById(id: string): Promise<CategoriaDataModel> {
    const entity = await this.uow.categoriasRepository.findById(id);
    if (!entity) throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    return CategoriaDataMapper.toDataModel(entity);
  }

  async create(data: { nombre: string; descripcion?: string }): Promise<CategoriaDataModel> {
    const existing = await this.uow.categoriasRepository.findByNombre(data.nombre);
    if (existing) throw new ConflictException(`Ya existe una categoría con el nombre '${data.nombre}'`);
    const entity = await this.uow.categoriasRepository.create(data);
    return CategoriaDataMapper.toDataModel(entity);
  }

  async update(id: string, data: { nombre?: string; descripcion?: string }): Promise<CategoriaDataModel> {
    await this.findById(id);
    if (data.nombre) {
      const existing = await this.uow.categoriasRepository.findByNombre(data.nombre);
      if (existing && existing.id !== id) throw new ConflictException(`Ya existe una categoría con el nombre '${data.nombre}'`);
    }
    const entity = await this.uow.categoriasRepository.update(id, data);
    return CategoriaDataMapper.toDataModel(entity);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.uow.categoriasRepository.delete(id);
  }
}
