import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const PROTO_PATH = join(__dirname, '../src/protos/integration.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const bookingProto = grpc.loadPackageDefinition(packageDefinition) as any;
const integrationPackage = bookingProto.booking.integration.v1;

async function testGrpc() {
  console.log('\n=== INICIANDO PRUEBA GRPC DE RESERVAS DE HOTELES ===\n');

  // Asegúrate de que el microservicio-integracion esté corriendo en localhost:5003
  const client = new integrationPackage.IntegrationService(
    'localhost:5003',
    grpc.credentials.createInsecure()
  );

  const providerId = 'aaaaaaaa-0001-4000-8000-000000000001'; // Locus (Israel Hernández)
  const item = {
    itemId: '3', // Alojamiento ID 3
    type: 'HOTEL',
    clientId: 'b523fbb5-e110-449e-b7d1-561bcf70471b',
    amountCents: 4500,
    providerId: providerId,
    hotel: {
      alojamiento_id: '3',
      habitacion_id: '1',
      fecha_inicio: { seconds: Math.floor(Date.now() / 1000) },
      fecha_fin: { seconds: Math.floor(Date.now() / 1000) + 86400 * 4 },
    },
  };

  // 1. Probar disponibilidad (CheckBatchAvailability)
  console.log('1. Llamando a CheckBatchAvailability...');
  client.CheckBatchAvailability({ items: [item] }, (err: any, response: any) => {
    if (err) {
      console.error('❌ Error en CheckBatchAvailability:', err.message);
      return;
    }
    console.log('✅ CheckBatchAvailability exitoso:', JSON.stringify(response, null, 2));

    // 2. Probar creación de reserva (CreateRemoteReservation)
    console.log('\n2. Llamando a CreateRemoteReservation...');
    client.CreateRemoteReservation({ item, idempotencyKey: 'test-key-123' }, (err: any, createResponse: any) => {
      if (err) {
        console.error('❌ Error en CreateRemoteReservation:', err.message);
        return;
      }
      console.log('✅ CreateRemoteReservation exitoso:', JSON.stringify(createResponse, null, 2));

      const remoteReservationId = createResponse.remoteReservationId || createResponse.remote_reservation_id;

      // 3. Probar confirmación de reserva (ConfirmRemoteReservation)
      console.log(`\n3. Llamando a ConfirmRemoteReservation para id=${remoteReservationId}...`);
      client.ConfirmRemoteReservation({
        type: 'HOTEL',
        remoteReservationId,
        providerId,
        idempotencyKey: 'test-key-confirm-123'
      }, (err: any, confirmResponse: any) => {
        if (err) {
          console.error('❌ Error en ConfirmRemoteReservation:', err.message);
          return;
        }
        console.log('✅ ConfirmRemoteReservation exitoso:', JSON.stringify(confirmResponse, null, 2));

        // 4. Probar cancelación de reserva (CancelRemoteReservation)
        console.log(`\n4. Llamando a CancelRemoteReservation para id=${remoteReservationId}...`);
        client.CancelRemoteReservation({
          type: 'HOTEL',
          remoteReservationId,
          providerId,
          reason: 'Prueba unitaria local exitosa',
          idempotencyKey: 'test-key-cancel-123'
        }, (err: any, cancelResponse: any) => {
          if (err) {
            console.error('❌ Error en CancelRemoteReservation:', err.message);
            return;
          }
          console.log('✅ CancelRemoteReservation exitoso:', JSON.stringify(cancelResponse, null, 2));
          console.log('\n=== PRUEBA GRPC COMPLETADA CON EXITO ===\n');
        });
      });
    });
  });
}

testGrpc();
