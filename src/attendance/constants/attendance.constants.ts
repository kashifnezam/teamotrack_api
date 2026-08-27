export const ATTENDANCE_COLLECTION = 'attendance';
export const ATTENDANCE_RECORDS_COLLECTION = 'records';

export const ATTENDANCE_STATUSES = {
  WORKING: 'working',
  PRESENT: 'present',
  LATE: 'late',
  HALF_DAY: 'half_day',
  ABSENT: 'absent',
  LEAVE: 'leave',
  WEEKLY_OFF: 'weekly_off',
  HOLIDAY: 'holiday',
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUSES)[keyof typeof ATTENDANCE_STATUSES];