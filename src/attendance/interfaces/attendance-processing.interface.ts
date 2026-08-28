export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'weekly_off' | 'holiday';

export type AttendanceType = 'full_day' | 'half_day';

export type AttendancePunctuality = 'on_time' | 'late';

export interface LeaveInfo {
  userId: string;
  leaveTypeId?: string;
  startDate: string;
  endDate: string;
  days?: number;
  status: string;
  duration: 'day' | 'half_day';
}

export interface ShiftConfig {
  shiftId: string;

  startHour: number;
  startMinute: number;

  endHour: number;
  endMinute: number;

  graceMinutes: number;

  halfDayMinutes: number;
  fullDayMinutes: number;

  weeklyOff: string[];
}

export interface Staff {
  uid: string;
  rootId: string;

  role: string;

  parentId?: string;

  teamId?: string;

  shiftId?: string;

  isActive?: boolean;

  userName?: string;
}

export interface UserDocument {
  uid: string;

  rootId?: string;

  role?: string;

  parentId?: string;

  teamId?: string;

  shiftId?: string;

  fullName?: string;

  name?: string;

  email?: string;

  mobile?: string;

  isActive?: boolean;

  isTrackingEnable?: boolean;
}

export interface RunLog {
  rootId: string;
  date: string;

  mode: 'automatic' | 'manual';

  triggeredBy: string;

  status: 'running' | 'completed' | 'partial_failed' | 'failed';

  startedAt: any;
  completedAt: any;

  processedStaff: number;

  created: number;
  updated: number;
  skipped: number;

  errors: number;
}

export interface ProcessingSummary {
  date: string;

  processed: number;
  created: number;
  updated: number;
  skipped: number;

  errors: Array<{
    staffId: string;
    error: string;
  }>;
}
