import { IsLatitude, IsLongitude, IsNumber, IsString, IsOptional } from 'class-validator';

export class CheckOutDto {
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsNumber()
  @IsLongitude()
  lng?: number;
}

export class CorrectCheckOutDto {
  @IsString()
  staffId!: string;

  @IsString()
  checkOutTime!: string;

  @IsString()
  reason!: string;
}
