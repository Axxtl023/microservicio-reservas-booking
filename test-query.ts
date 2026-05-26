import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
require('dotenv').config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('\n=== TODOS LOS PROVEEDORES EN BD ===\n');
  const proveedores = await prisma.proveedores.findMany({
    orderBy: { tipo: 'asc' },
  });
  console.table(proveedores.map(p => ({
    id: p.id.substring(0, 8) + '...',
    nombre: p.nombre,
    tipo: p.tipo,
    activo: p.activo,
    url: p.url_api_base.substring(0, 50) + '...',
  })));

  console.log(`\nTotal proveedores: ${proveedores.length}`);
  
  // Contar por tipo
  const porTipo: Record<string, number> = {};
  proveedores.forEach(p => { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });
  console.log('\nProveedores por tipo:');
  console.table(porTipo);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
