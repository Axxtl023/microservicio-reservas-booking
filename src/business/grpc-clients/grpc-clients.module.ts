import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { FINANCE_GRPC_CLIENT, FinanceClient } from './finance.client';
import { INTEGRATION_GRPC_CLIENT, IntegrationClient } from './integration.client';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: INTEGRATION_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'booking.integration.v1',
          protoPath: join(__dirname, '../../protos/integration.proto'),
          url: process.env.INTEGRATION_GRPC_URL ?? 'localhost:5003',
        },
      },
      {
        name: FINANCE_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'booking.finance.v1',
          protoPath: join(__dirname, '../../protos/finance.proto'),
          url: process.env.FINANCE_GRPC_URL ?? 'localhost:5002',
        },
      },
    ]),
  ],
  providers: [IntegrationClient, FinanceClient],
  exports: [IntegrationClient, FinanceClient],
})
export class GrpcClientsModule {}
