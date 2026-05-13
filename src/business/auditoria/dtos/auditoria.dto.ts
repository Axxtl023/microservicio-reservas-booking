import { ApiProperty } from '@nestjs/swagger';

export class AuditoriaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false }) idUsuario?: string;
  @ApiProperty() accion!: string;
  @ApiProperty() tabla!: string;
  @ApiProperty({ required: false }) detalles?: string;
  @ApiProperty({ required: false }) ip?: string;
  @ApiProperty() fecha!: Date;
}
