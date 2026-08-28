import {
    AttendancePunctuality,
    AttendanceStatus,
    AttendanceType,
} from '../interfaces/attendance-processing.interface';

export interface AttendanceActionResponse {

    id: string;

    staffId: string;

    date: string;

    status: AttendanceStatus;

    attendanceType?: AttendanceType;

    punctuality?: AttendancePunctuality;

    checkInTime?: string;

    checkOutTime?: string;

    workingMinutes: number;

    message: string;
}