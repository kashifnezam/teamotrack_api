import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectAttendanceRegularizationDto {
  /*
   * Rejection reason is optional.
   *
   * If supplied, it must contain at least 3 characters.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;
}
