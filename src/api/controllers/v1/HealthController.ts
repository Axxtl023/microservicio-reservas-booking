import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Public } from '../../decorators/public.decorator';

@Public()
@Controller('api/v1/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
  ) {}

  @Get()
  async check() {
    let dbStatus: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }
    const rabbitStatus: 'up' | 'down' = this.amqp.connected ? 'up' : 'down';
    const allUp = dbStatus === 'up' && rabbitStatus === 'up';
    const result = {
      status: allUp ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: { database: dbStatus, rabbitmq: rabbitStatus },
    };
    if (!allUp) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('rabbitmq')
  async checkRabbit() {
    const isConnected = this.amqp.connected;
    const result = {
      rabbitmq: isConnected ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
    if (!isConnected) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
