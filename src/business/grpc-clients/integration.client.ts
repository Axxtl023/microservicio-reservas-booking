import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { v4 as uuidv4 } from 'uuid';

export const INTEGRATION_GRPC_CLIENT = 'INTEGRATION_GRPC_CLIENT';

export enum ProviderType {
  PROVIDER_TYPE_UNSPECIFIED = 0,
  VEHICLE = 1,
  FLIGHT = 2,
  HOTEL = 3,
  TOUR = 4,
}

export interface ProtoTimestamp {
  seconds: number;
  nanos?: number;
}

export interface BookingItem {
  itemId: string;
  type: ProviderType;
  clientId: string;
  amountCents: number;
  providerId: string;
  vehicle?: {
    vehiculoId: string;
    agenciaId?: string;
    fechaInicio?: ProtoTimestamp;
    fechaFin?: ProtoTimestamp;
  };
  flight?: {
    flightClassId: string;
    passengers: Array<{
      firstName: string;
      lastName: string;
      documentNumber: string;
      seatNumber?: string;
    }>;
  };
  hotel?: {
    alojamientoId?: string;
    habitacionId?: string;
    fechaInicio?: ProtoTimestamp;
    fechaFin?: ProtoTimestamp;
  };
  tour?: {
    slotId: string;
    attractionId: string;
    productOptionId: string;
    passengers: Array<{
      firstName: string;
      lastName: string;
      documentNumber: string;
      documentType?: string;
    }>;
    contactName?: string;
    contactEmail?: string;
  };
  };
}

export interface AvailabilityResult {
  itemId: string;
  type: ProviderType;
  providerItemId: string;
  available: boolean;
  reason: string;
}

export interface CheckBatchAvailabilityResponse {
  allAvailable?: boolean;
  all_available?: boolean;
  results: AvailabilityResult[];
}

export interface CreateRemoteReservationResponse {
  type: ProviderType;
  remoteReservationId?: string;
  remote_reservation_id?: string;
  providerReservationCode?: string;
  provider_reservation_code?: string;
  status: string;
}

export type RemoteReservationMutationResponse = CreateRemoteReservationResponse;

interface IntegrationGrpcService {
  checkBatchAvailability(request: { items: BookingItem[] }): Observable<CheckBatchAvailabilityResponse>;
  createRemoteReservation(request: { item: BookingItem; idempotencyKey: string }): Observable<CreateRemoteReservationResponse>;
  confirmRemoteReservation(request: {
    type: ProviderType;
    remoteReservationId: string;
    providerId: string;
    idempotencyKey: string;
  }): Observable<RemoteReservationMutationResponse>;
  cancelRemoteReservation(request: {
    type: ProviderType;
    remoteReservationId: string;
    providerId: string;
    reason: string;
    idempotencyKey: string;
  }): Observable<RemoteReservationMutationResponse>;
}

export class IntegrationUnavailableError extends Error {}
export class ReservaNoDisponibleError extends Error {}

@Injectable()
export class IntegrationClient implements OnModuleInit {
  private service!: IntegrationGrpcService;

  constructor(@Inject(INTEGRATION_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.service = this.client.getService<IntegrationGrpcService>('IntegrationService');
  }

  async checkBatchAvailability(items: BookingItem[]): Promise<CheckBatchAvailabilityResponse> {
    try {
      const response = await firstValueFrom(this.service.checkBatchAvailability({ items }));
      if (!(response.allAvailable ?? response.all_available)) {
        throw new ReservaNoDisponibleError('Uno o más items no están disponibles');
      }
      return response;
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  async createRemoteReservation(
    item: BookingItem,
    idempotencyKey = uuidv4(),
  ): Promise<CreateRemoteReservationResponse> {
    try {
      return await firstValueFrom(this.service.createRemoteReservation({ item, idempotencyKey }));
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  async confirmRemoteReservation(
    type: ProviderType,
    remoteReservationId: string,
    providerId: string,
    idempotencyKey = uuidv4(),
  ): Promise<RemoteReservationMutationResponse> {
    try {
      return await firstValueFrom(
        this.service.confirmRemoteReservation({ type, remoteReservationId, providerId, idempotencyKey }),
      );
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  async cancelRemoteReservation(
    type: ProviderType,
    remoteReservationId: string,
    providerId: string,
    reason: string,
    idempotencyKey = uuidv4(),
  ): Promise<RemoteReservationMutationResponse> {
    try {
      return await firstValueFrom(
        this.service.cancelRemoteReservation({ type, remoteReservationId, providerId, reason, idempotencyKey }),
      );
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  private toDomainError(error: unknown): Error {
    const grpcError = error as { code?: number; message?: string };
    const message = grpcError.message ?? 'Error de integración gRPC';
    if (grpcError.code === status.FAILED_PRECONDITION || grpcError.code === status.NOT_FOUND) {
      return new ReservaNoDisponibleError(message);
    }
    if (grpcError.code === status.UNAVAILABLE || grpcError.code === status.DEADLINE_EXCEEDED) {
      return new IntegrationUnavailableError(message);
    }
    return error instanceof Error ? error : new IntegrationUnavailableError(message);
  }
}
