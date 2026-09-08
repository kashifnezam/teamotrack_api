import { IsLatitude, IsLongitude, IsNumber, IsOptional } from 'class-validator';

export class BreakDto {
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsNumber()
  @IsLongitude()
  lng?: number;
}
