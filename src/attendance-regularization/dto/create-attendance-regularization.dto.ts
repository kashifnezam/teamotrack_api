import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAttendanceRegularizationDto {
  /*
   * Attendance date.
   *
   * Example:
   * 2026-09-05
   *
   * The employee only tells us which attendance
   * date needs regularization.
   */
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /*
   * Optional supporting attachment.
   *
   * Store only the URL/reference here.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachmentUrl?: string;
}
