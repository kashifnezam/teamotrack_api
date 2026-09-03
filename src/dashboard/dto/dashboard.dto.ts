/* ==========================================================
   TeamoTrack Dashboard DTO
========================================================== */

export type DashboardScopeType = 'organization' | 'hierarchy' | 'self';

export interface DashboardUserDto {
  id: string;

  fullName: string;

  role: string;
}

export interface DashboardTeamFilterDto {
  id: string;

  name: string;
}

export interface DashboardManagerFilterDto {
  id: string;

  fullName: string;
}

export interface DashboardFiltersDto {
  teams: DashboardTeamFilterDto[];

  managers: DashboardManagerFilterDto[];
}

export interface DashboardScopeDto {
  type: DashboardScopeType;

  label: string;

  totalStaff: number;
}

export interface DashboardAttendanceDto {
  total: number;

  present: number;

  working: number;

  late: number;

  leave: number;

  absent: number;

  percentage: number;
}

export interface DashboardTrackingDto {
  online: number;

  offline: number;
}

export interface DashboardLocationDto {
  lat: number;

  lng: number;
}

export interface DashboardStaffDto {
  id: string;

  fullName: string;

  role: string;

  teamId?: string;

  teamName?: string;

  managerId?: string;

  managerName?: string;

  status: 'present' | 'working' | 'late' | 'leave' | 'absent';

  checkIn?: string;

  checkOut?: string;

  workingMinutes?: number;

  currLoc?: DashboardLocationDto;
}

export class DashboardDto {
  user!: DashboardUserDto;

  scope!: DashboardScopeDto;

  date!: string;

  filters!: DashboardFiltersDto;

  attendance!: DashboardAttendanceDto;

  tracking!: DashboardTrackingDto;

  staff!: DashboardStaffDto[];

  /*
   * HR dashboard
   */
  hr?: {
    pendingLeave: any[];
    exceptions: any[];
    holidays: any[];
  };
}
