import {
  Controller, Get, Query, Inject, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { buildMeta } from '../../../common/pagination.types';
import type { IAuditoriaService } from '../../../business/auditoria/interfaces/i-auditoria.service';
import { IAUDITORIA_SERVICE } from '../../../business/auditoria/interfaces/i-auditoria.service';
import { AuditoriaResponseDto } from '../../../business/auditoria/dtos/auditoria.dto';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@ApiTags('Auditoría')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/v1/auditoria')
export class AuditoriaController {
  constructor(
    @Inject(IAUDITORIA_SERVICE)
    private readonly auditoriaService: IAuditoriaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros de auditoría con paginación (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResult<AuditoriaResponseDto[]>> {
    try {
      const p = page ? Number(page) : 1;
      const l = limit ? Number(limit) : 50;
      const result = await this.auditoriaService.findAll(p, l);
      return ApiResult.paginated(
        result.data as unknown as AuditoriaResponseDto[],
        buildMeta(result.total, p, l),
        'Registros de auditoría obtenidos exitosamente',
      );
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error instanceof Error ? error.message : 'Error interno';
      throw new HttpException(ApiResult.fail(message), status);
    }
  }
}
