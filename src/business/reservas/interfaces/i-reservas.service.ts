import type { ReservaDataModel } from '../../../data-management/models/reserva.data-model';

export interface IReservasService {
  checkout(idCarrito: string, idCliente: string): Promise<ReservaDataModel>;
  getMisReservas(idCliente: string): Promise<ReservaDataModel[]>;
  getAllReservasPaginated(filtros: { search?: string; page: number; limit: number }): Promise<{ data: ReservaDataModel[]; total: number; page: number; limit: number }>;
  getById(id: string): Promise<ReservaDataModel>;
  updateEstado(id: string, status: string): Promise<ReservaDataModel>;
}

export const IRESERVAS_SERVICE = 'IRESERVAS_SERVICE';
