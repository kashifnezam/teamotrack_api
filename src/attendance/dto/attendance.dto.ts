import { IsInt, IsString, Max, Min } from 'class-validator';

export class AttendanceDto {
  @IsString()
  staffId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2020)
  year!: number;
}
