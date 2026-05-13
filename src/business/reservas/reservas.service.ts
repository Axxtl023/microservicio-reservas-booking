import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IReservasService } from './interfaces/i-reservas.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { ReservaDataMapper } from '../../data-management/mappers/reserva.data-mapper';
import type { ReservaDataModel } from '../../data-management/models/reserva.data-model';

@Injectable()
export class ReservasService implements IReservasService {
  constructor(@Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork) {}

  async checkout(idCarrito: string, idCliente: string): Promise<ReservaDataModel> {
    const reserva = await this.uow.convertirCarritoAReservaAtomic(idCarrito, idCliente);
    return ReservaDataMapper.toDataModel(reserva);
  }

  async getMisReservas(idCliente: string): Promise<ReservaDataModel[]> {
    const entities = await this.uow.reservasRepository.findByCliente(idCliente);
    return ReservaDataMapper.toDataModelList(entities);
  }

  async getAllReservasPaginated(filtros: { search?: string; page: number; limit: number }): Promise<{ data: ReservaDataModel[]; total: number; page: number; limit: number }> {
    const result = await this.uow.reservasRepository.findAllPaginated(filtros);
    return {
      data: ReservaDataMapper.toDataModelList(result.data),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getById(id: string): Promise<ReservaDataModel> {
    const entity = await this.uow.reservasRepository.findById(id);
    if (!entity) throw new NotFoundException(`Reserva con id ${id} no encontrada`);
    return ReservaDataMapper.toDataModel(entity);
  }

  async updateEstado(id: string, status: string): Promise<ReservaDataModel> {
    await this.getById(id);
    const entity = await this.uow.reservasRepository.updateEstado(id, status);
    return ReservaDataMapper.toDataModel(entity);
  }
}
