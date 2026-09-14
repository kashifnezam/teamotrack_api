import { IsEnum } from 'class-validator';

export enum AttendanceRegularizationResult {
  ABSENT = 'absent',
  HALF_DAY = 'half_day',
  FULL_DAY = 'full_day',
}

export class ReviewAttendanceRegularizationDto {
  /*
   * Final attendance result decided by manager/HR.
   *
   * This is the only attendance decision required.
   */
  @IsEnum(AttendanceRegularizationResult)
  attendanceStatus!: AttendanceRegularizationResult;
}
