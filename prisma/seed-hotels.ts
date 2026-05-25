import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
require('dotenv').config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Inserting hotel providers into database...');
  const sql = `
    INSERT INTO proveedores (id, nombre, tipo, url_api_base, activo) VALUES
      ('aaaaaaaa-0001-4000-8000-000000000001', 'Locus',         'HOTEL', 'https://israel-apigateway.onrender.com', true),
      ('aaaaaaaa-0002-4000-8000-000000000002', 'AlojaExpress',  'HOTEL', 'https://api-gateway-y75a.onrender.com/api/v1', true),
      ('aaaaaaaa-0003-4000-8000-000000000003', 'HousingPlace',  'HOTEL', 'https://alojamientosapigateway.onrender.com/api/v1/naomy-analuisa', true),
      ('aaaaaaaa-0004-4000-8000-000000000004', 'Homiya',        'HOTEL', 'https://apigateway-mr.onrender.com', true),
      ('aaaaaaaa-0005-4000-8000-000000000005', 'Rodrigo''s',    'HOTEL', 'https://apigatway-0wjx.onrender.com', true)
    ON CONFLICT (id) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      tipo = EXCLUDED.tipo,
      url_api_base = EXCLUDED.url_api_base,
      activo = EXCLUDED.activo;
  `;
  await prisma.$executeRawUnsafe(sql);
  console.log('Hotel providers inserted successfully.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
