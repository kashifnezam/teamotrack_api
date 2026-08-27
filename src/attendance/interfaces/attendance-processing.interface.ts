export type AttendanceStatus =
    | 'working'
    | 'present'
    | 'late'
    | 'half_day'
    | 'absent'
    | 'leave'
    | 'weekly_off'
    | 'holiday';

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
    role?: string;
    parentId?: string;
    teamId?: string;
    shiftId?: string;
    isActive?: boolean;
    userName?: string;
}

export interface LeaveInfo {
    userId: string;
    leaveTypeId?: string;
    startDate: string;
    endDate: string;
    days?: number;
    status: string;
    duration?: 'day' | 'half_day';
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

export interface RunLog {
    rootId: string;
    date: string;
    mode: 'automatic' | 'manual';
    triggeredBy: string;
    status: 'running' | 'completed' | 'partial_failed' | 'failed';
    startedAt: FirebaseFirestore.Timestamp | null;
    completedAt?: FirebaseFirestore.Timestamp | null;
    processedStaff: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
}

export interface UserDocument {
    uid: string;

    rootId?: string;
    parentId?: string;

    role?: string;

    teamId?: string;
    shiftId?: string;

    isActive?: boolean;

    fullName?: string;
    userName?: string;

    email?: string;
    mobile?: string;

    [key: string]: unknown;
}