import type { ReservaDataModel } from '../../../data-management/models/reserva.data-model';
import type { IssueInvoiceResponse } from '../../grpc-clients/finance.client';

export interface CheckoutInput {
  idCarrito: string;
  idCliente: string;
  metodoPagoId: string;
  currency: string;
  // Los siguientes campos son DEPRECATED — se mantienen opcionales para
  // retrocompat del cliente viejo. La fuente de verdad son los `metadata`
  // por-item del carrito. Si vienen acá, se usan solo como fallback cuando
  // un item no tiene metadata.
  fechaInicio?: string;
  fechaFin?: string;
  agenciaId?: string;
}

export interface CheckoutResult {
  reserva: ReservaDataModel;
  factura: IssueInvoiceResponse;
}

export interface IReservasService {
  checkout(input: CheckoutInput): Promise<CheckoutResult>;
  getMisReservas(idCliente: string): Promise<ReservaDataModel[]>;
  getAllReservasPaginated(filtros: { search?: string; page: number; limit: number }): Promise<{ data: ReservaDataModel[]; total: number; page: number; limit: number }>;
  getById(id: string): Promise<ReservaDataModel>;
  updateEstado(id: string, status: string): Promise<ReservaDataModel>;
  cancelarMiReserva(id: string, idCliente: string, rol: string): Promise<ReservaDataModel>;
}

export const IRESERVAS_SERVICE = 'IRESERVAS_SERVICE';
