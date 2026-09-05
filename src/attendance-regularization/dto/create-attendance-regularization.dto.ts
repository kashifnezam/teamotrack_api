import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum AttendanceRegularizationType {
  MISSED_CHECK_IN = 'MISSED_CHECK_IN',

  MISSED_CHECK_OUT = 'MISSED_CHECK_OUT',

  MISSED_BOTH = 'MISSED_BOTH',

  WRONG_CHECK_IN = 'WRONG_CHECK_IN',

  WRONG_CHECK_OUT = 'WRONG_CHECK_OUT',

  WRONG_BOTH = 'WRONG_BOTH',

  SYSTEM_ERROR = 'SYSTEM_ERROR',

  LOCATION_ERROR = 'LOCATION_ERROR',

  OTHER = 'OTHER',
}

export class CreateAttendanceRegularizationDto {
  /*
   * Attendance date.
   *
   * Example:
   * 2026-09-05
   */
  @IsDateString()
  date!: string;

  @IsEnum(AttendanceRegularizationType)
  type!: AttendanceRegularizationType;

  /*
   * Requested check-in time.
   *
   * ISO 8601:
   * 2026-09-05T09:10:00+05:30
   */
  @IsOptional()
  @IsDateString()
  checkInTime?: string;

  /*
   * Requested check-out time.
   *
   * ISO 8601:
   * 2026-09-05T18:05:00+05:30
   */
  @IsOptional()
  @IsDateString()
  checkOutTime?: string;

  /*
   * Mandatory explanation.
   */
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
