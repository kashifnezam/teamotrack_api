import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ShiftDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  startHour!: number;

  @IsInt()
  @Min(0)
  startMinute!: number;

  @IsInt()
  @Min(0)
  endHour!: number;

  @IsInt()
  @Min(0)
  endMinute!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakStartHour?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakStartMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakEndHour?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakEndMinute?: number | null;

  @IsInt()
  @Min(0)
  graceMinutes!: number;

  @IsInt()
  @Min(0)
  halfDayMinutes!: number;

  @IsInt()
  @Min(0)
  fullDayMinutes!: number;

  @IsArray()
  weeklyOff!: number[];

  /*
   * When enabled, employees assigned to this
   * shift must complete the selfie attendance
   * flow before check-in.
   */
  @IsBoolean()
  selfieCheckIn!: boolean;

  /*
   * When enabled, employees assigned to this
   * shift must complete the selfie attendance
   * flow before check-out.
   */
  @IsBoolean()
  selfieCheckOut!: boolean;
}
