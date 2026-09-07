import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { LeaveService } from '../leave/leave.service';
import { HolidayService } from '../holiday/holiday.service';
import { AttendanceRegularizationService } from '../attendance-regularization/attendance-regularization.service';

@Injectable()
export class HrDashboardService {
  private readonly logger = new Logger(HrDashboardService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly leaveService: LeaveService,
    private readonly holidayService: HolidayService,
    private readonly attendanceRegularizationService: AttendanceRegularizationService
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==========================================================
  // MAIN
  // ==========================================================

  async getDashboardData(user: any, requestedDate?: string) {
    const uid = user?.uid ?? user?.id;

    if (!uid) {
      throw new BadRequestException('User UID is missing');
    }

    const currentUser = await this.getUser(uid);

    /*
     * There is NO root_hr role.
     *
     * Only normal HR users use this dashboard.
     */
    if (currentUser.role !== 'hr') {
      throw new ForbiddenException('HR dashboard access required');
    }

    /*
     * --------------------------------------------------------
     * DASHBOARD PERMISSION
     * --------------------------------------------------------
     *
     * HR dashboard itself requires at least one useful
     * dashboard permission.
     *
     * Attendance / tracking / leave / staff visibility
     * are checked separately below.
     */
    const permissions = await this.permissions(currentUser.uid);

    const hasDashboardAccess =
      permissions['attendance.view'] === true ||
      permissions['field_executive.view'] === true ||
      permissions['manager.view'] === true ||
      permissions['hr.view'] === true ||
      permissions['leave.view'] === true ||
      permissions['tracking.view'] === true ||
      permissions['task.view'] === true;

    if (!hasDashboardAccess) {
      throw new ForbiddenException('You do not have permission to access the HR dashboard');
    }

    const rootId = this.getRootId(currentUser);

    const date = this.resolveDashboardDate(requestedDate);

    this.logger.log(`HR dashboard | user=${uid} role=${currentUser.role} root=${rootId} date=${date}`);

    // ========================================================
    // ORGANIZATION
    // ========================================================

    const snapshot = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    })) as any[];

    /*
     * Root manager itself may not be returned by the
     * rootId query because its own document normally
     * does not contain rootId.
     *
     * We only need it as the top hierarchy node.
     */
    const rootUser = await this.getUser(rootId);

    users.push(rootUser);

    // ========================================================
    // TEAMS
    // ========================================================

    const teams = await this.loadTeams(rootId);

    const enrichedUsers = users.map((item) => this.enrichTeam(item, teams));

    // ========================================================
    // HR SCOPE
    // ========================================================

    const visibleStaff = await this.getVisibleStaff(currentUser, enrichedUsers, permissions);

    // ========================================================
    // ATTENDANCE
    // ========================================================

    let todayAttendance = new Map<string, any>();

    /*
     * Attendance is loaded only if HR has attendance
     * permission.
     */
    if (permissions['attendance.view'] === true) {
      const attendanceMap = await this.loadAttendance(visibleStaff, date);

      todayAttendance = attendanceMap.get(date) ?? new Map<string, any>();
    }

    const staff = visibleStaff.map((item) => {
      const id = item.uid || item.id;

      return this.buildStaffRow(item, todayAttendance.get(id), permissions);
    });

    // ========================================================
    // SUMMARY
    // ========================================================

    const attendance =
      permissions['attendance.view'] === true ? this.calculateAttendance(staff) : this.emptyAttendance();

    const tracking =
      permissions['tracking.view'] === true
        ? this.calculateTracking(staff)
        : {
            online: 0,
            offline: 0,
          };

    // ========================================================
    // HR DATA
    // ========================================================

    let pendingLeave: any[] = [];
    let regularizations: any[] = [];
    let holidays: any[] = [];

    /*
     * Leave only when HR has leave permission.
     */
    if (permissions['leave.view'] === true || permissions['leave.approve'] === true) {
      pendingLeave = await this.loadPendingLeave(currentUser, permissions);
    }

    /*
     * Attendance regularizations are approval/processing
     * requests and therefore require attendance.manage.
     */
    if (permissions['attendance.manage'] === true) {
      regularizations = await this.loadPendingRegularizations(currentUser);
    }

    /*
     * Holidays can be displayed when the HR can access
     * attendance/leave information.
     */
    if (
      permissions['attendance.view'] === true ||
      permissions['attendance.manage'] === true ||
      permissions['leave.view'] === true ||
      permissions['leave.approve'] === true
    ) {
      holidays = await this.loadUpcomingHolidays(currentUser, date);
    }

    // ========================================================
    // FILTERS
    // ========================================================

    const filters = this.getFilterOptions(visibleStaff, enrichedUsers);

    // ========================================================
    // RESPONSE
    // ========================================================

    return {
      user: {
        id: currentUser.uid,

        fullName: currentUser.fullName ?? currentUser.userName ?? currentUser.name ?? 'User',

        role: currentUser.role,
      },

      scope: {
        type: 'hierarchy',

        label: 'Authorized Staff',

        totalStaff: staff.length,
      },

      date,

      filters,

      attendance,

      tracking,

      staff,

      hr: {
        pendingLeave,
        regularizations,
        holidays,
      },
    };
  }

  // ==========================================================
  // VISIBLE STAFF
  // ==========================================================

  private async getVisibleStaff(hr: any, users: any[], permissions: Record<string, any>): Promise<any[]> {
    if (!hr.parentId) {
      this.logger.warn(`HR has no parent | hr=${hr.uid}`);

      return [];
    }

    /*
     * HR belongs to one manager.
     */
    const manager = users.find(
      (item) => (item.uid || item.id) === hr.parentId && (item.role === 'manager' || item.role === 'root_manager')
    );

    if (!manager) {
      this.logger.warn(`HR parent manager not found | hr=${hr.uid} parent=${hr.parentId}`);

      return [];
    }

    /*
     * Build hierarchy.
     */
    const byParent = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId && !item.rootId) {
        continue;
      }

      const parentKey = item.parentId || item.rootId;

      if (!parentKey) {
        continue;
      }

      const children = byParent.get(parentKey) ?? [];

      children.push(item);

      byParent.set(parentKey, children);
    }

    /*
     * Collect ONLY executives.
     *
     * Managers are used only to traverse
     * the hierarchy. They are never returned.
     */
    const executives: any[] = [];

    const visited = new Set<string>();

    const walk = (managerId: string) => {
      if (visited.has(managerId)) {
        return;
      }

      visited.add(managerId);

      for (const child of byParent.get(managerId) ?? []) {
        /*
         * Executive belongs to this manager.
         */
        if (child.role === 'field_executive') {
          executives.push(child);
        }

        /*
         * Child managers extend the HR scope.
         *
         * We traverse them, but do NOT return them.
         */
        if (child.role === 'manager') {
          walk(child.uid || child.id);
        }
      }
    };

    /*
     * Start from HR's direct manager.
     */
    walk(manager.uid || manager.id);

    /*
     * Remove duplicates.
     */
    const uniqueExecutives = Array.from(new Map(executives.map((item) => [item.uid || item.id, item])).values());

    /*
     * HR permission controls executive visibility.
     *
     * HR does not receive manager/hr records,
     * regardless of manager.view or hr.view.
     */
    if (permissions['field_executive.view'] !== true && permissions['field_executive.edit'] !== true) {
      return [];
    }

    return uniqueExecutives.filter((item) => (item.uid || item.id) !== hr.uid);
  }

  // ==========================================================
  // TEAMS
  // ==========================================================

  private async loadTeams(rootId: string): Promise<Map<string, any>> {
    const result = new Map<string, any>();

    const snapshot = await this.db.collection('teams').where('rootId', '==', rootId).get();

    snapshot.docs.forEach((doc) => {
      result.set(doc.id, {
        id: doc.id,
        ...doc.data(),
      });
    });

    return result;
  }

  private enrichTeam(user: any, teams: Map<string, any>) {
    if (!user.teamId) {
      return {
        ...user,
      };
    }

    const team = teams.get(user.teamId);

    if (!team) {
      return {
        ...user,
      };
    }

    return {
      ...user,

      teamName: team.name ?? team.teamName ?? team.title ?? 'Unnamed Team',
    };
  }

  // ==========================================================
  // FILTERS
  // ==========================================================

  private getFilterOptions(visibleStaff: any[], allUsers: any[]) {
    const teams = new Map<string, string>();

    for (const item of visibleStaff) {
      if (!item.teamId) {
        continue;
      }

      teams.set(item.teamId, item.teamName ?? 'Unnamed Team');
    }

    const managerIds = new Set<string>();

    for (const item of visibleStaff) {
      if (item.role === 'manager') {
        managerIds.add(item.uid || item.id);
      }

      if (item.parentId) {
        const parent = allUsers.find((candidate) => (candidate.uid || candidate.id) === item.parentId);

        if (parent?.role === 'manager') {
          managerIds.add(parent.uid || parent.id);
        }
      }
    }

    return {
      teams: Array.from(teams.entries())
        .map(([id, name]) => ({
          id,
          name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),

      managers: allUsers
        .filter((item) => item.role === 'manager' && managerIds.has(item.uid || item.id))
        .map((item) => ({
          id: item.uid || item.id,

          fullName: item.fullName ?? item.userName ?? item.name ?? 'Unnamed Manager',
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    };
  }

  // ==========================================================
  // ATTENDANCE
  // ==========================================================

  private async loadAttendance(staff: any[], date: string): Promise<Map<string, Map<string, any>>> {
    const attendanceMap = new Map<string, Map<string, any>>();

    const dateMap = new Map<string, any>();

    attendanceMap.set(date, dateMap);

    if (!staff.length) {
      return attendanceMap;
    }

    const refs = staff.map((item) => {
      const id = item.uid || item.id;

      return this.db.collection('attendance').doc(id).collection('records').doc(date);
    });

    const snapshots = await this.db.getAll(...refs);

    snapshots.forEach((doc, index) => {
      if (!doc.exists) {
        return;
      }

      const id = staff[index].uid || staff[index].id;

      dateMap.set(id, {
        id: doc.id,

        ...(doc.data() ?? {}),
      });
    });

    return attendanceMap;
  }

  // ==========================================================
  // STAFF ROW
  // ==========================================================

  private buildStaffRow(user: any, attendance: any, permissions: Record<string, any>) {
    const id = user.uid || user.id;

    const result: any = {
      id,

      fullName: user.fullName ?? user.userName ?? user.name ?? 'Unknown',

      role: user.role ?? '',

      status:
        permissions['attendance.view'] === true || permissions['attendance.manage'] === true
          ? this.getAttendanceStatus(attendance)
          : 'not_marked',
    };

    if (user.teamId) {
      result.teamId = user.teamId;
    }

    if (user.teamName) {
      result.teamName = user.teamName;
    }

    if (user.parentId) {
      result.managerId = user.parentId;

      const parentName = user.parentName ?? user.managerName;

      if (parentName) {
        result.managerName = parentName;
      }
    }

    /*
     * Attendance fields are only returned when HR
     * has attendance permission.
     */
    if (permissions['attendance.view'] === true || permissions['attendance.manage'] === true) {
      if (attendance?.checkInTime) {
        result.checkIn = this.serializeDate(attendance.checkInTime);
      }

      if (attendance?.checkOutTime) {
        result.checkOut = this.serializeDate(attendance.checkOutTime);
      }

      if (attendance?.workingMinutes != null) {
        result.workingMinutes = Number(attendance.workingMinutes);
      }

      if (attendance?.attendanceType === 'full_day' || attendance?.attendanceType === 'half_day') {
        result.attendanceType = attendance.attendanceType;
      }

      if (attendance?.punctuality === 'on_time' || attendance?.punctuality === 'late') {
        result.punctuality = attendance.punctuality;
      }

      if (attendance?.leaveDuration) {
        result.leaveDuration = attendance.leaveDuration;
      }

      if (attendance?.leaveTypeId) {
        result.leaveTypeId = attendance.leaveTypeId;
      }
    }

    /*
     * Tracking is independently permission controlled.
     */
    if (permissions['tracking.view'] === true) {
      const location = this.getLocation(user);

      if (location) {
        result.currLoc = location;
      }
    }

    return result;
  }

  // ==========================================================
  // ATTENDANCE STATUS
  // ==========================================================

  private getAttendanceStatus(
    attendance: any
  ): 'not_marked' | 'present' | 'working' | 'late' | 'leave' | 'absent' | 'weekly_off' | 'holiday' {
    if (!attendance) {
      return 'not_marked';
    }

    if (attendance.status === 'leave') {
      return 'leave';
    }

    if (attendance.status === 'weekly_off') {
      return 'weekly_off';
    }

    if (attendance.status === 'holiday') {
      return 'holiday';
    }

    if (attendance.status === 'absent') {
      return 'absent';
    }

    if (attendance.checkInTime && !attendance.checkOutTime) {
      return 'working';
    }

    if (attendance.punctuality === 'late') {
      return 'late';
    }

    if (attendance.status === 'present') {
      return 'present';
    }

    if (attendance.checkInTime) {
      return 'present';
    }

    return 'not_marked';
  }

  // ==========================================================
  // ATTENDANCE SUMMARY
  // ==========================================================

  private calculateAttendance(staff: any[]) {
    const total = staff.length;

    const present = staff.filter(
      (item) => item.status === 'present' || item.status === 'working' || item.status === 'late'
    ).length;

    const working = staff.filter((item) => item.status === 'working').length;

    const late = staff.filter((item) => item.status === 'late').length;

    const leave = staff.filter((item) => item.status === 'leave').length;

    const absent = staff.filter((item) => item.status === 'absent').length;

    const weeklyOff = staff.filter((item) => item.status === 'weekly_off').length;

    const holiday = staff.filter((item) => item.status === 'holiday').length;

    const notMarked = staff.filter((item) => item.status === 'not_marked').length;

    const marked = present + leave + absent + weeklyOff + holiday;

    const percentage = marked > 0 ? Math.round((present / marked) * 100) : 0;

    return {
      total,
      marked,
      notMarked,
      present,
      working,
      late,
      leave,
      absent,
      weeklyOff,
      holiday,
      percentage,
    };
  }

  private emptyAttendance() {
    return {
      total: 0,
      marked: 0,
      notMarked: 0,
      present: 0,
      working: 0,
      late: 0,
      leave: 0,
      absent: 0,
      weeklyOff: 0,
      holiday: 0,
      percentage: 0,
    };
  }

  // ==========================================================
  // TRACKING
  // ==========================================================

  private calculateTracking(staff: any[]) {
    let online = 0;

    for (const item of staff) {
      if (this.getLocation(item)) {
        online++;
      }
    }

    return {
      online,

      offline: Math.max(staff.length - online, 0),
    };
  }

  // ==========================================================
  // REGULARIZATIONS
  // ==========================================================

  private async loadPendingRegularizations(user: any) {
    try {
      const result = await this.attendanceRegularizationService.getApprovals(user.uid);

      return result?.requests ?? [];
    } catch (error) {
      this.logger.warn(
        `Unable to load HR attendance regularizations | user=${user.uid} | ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      return [];
    }
  }

  // ==========================================================
  // LEAVE
  // ==========================================================

  private async loadPendingLeave(user: any, permissions: Record<string, any>) {
    if (permissions['leave.view'] !== true && permissions['leave.approve'] !== true) {
      return [];
    }

    try {
      const result = await this.leaveService.getApprovals(user.uid);

      return result?.approvals ?? [];
    } catch (error) {
      this.logger.warn(
        `Unable to load HR leave approvals | user=${user.uid} | ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      return [];
    }
  }

  // ==========================================================
  // HOLIDAYS
  // ==========================================================

  private async loadUpcomingHolidays(user: any, date: string) {
    const startDate = this.dashboardDateToIso(date);

    const endDate = this.addDaysToIsoDate(startDate, 30);

    const result = await this.holidayService.getRange(user.uid, startDate, endDate);

    return result?.holidays ?? [];
  }

  // ==========================================================
  // LOCATION
  // ==========================================================

  private getLocation(user: any) {
    const loc = user?.currLoc;

    if (loc?.lat == null || loc?.lng == null) {
      return undefined;
    }

    const lat = Number(loc.lat);

    const lng = Number(loc.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }

    return {
      lat,
      lng,
    };
  }

  // ==========================================================
  // PERMISSIONS
  // ==========================================================

  private async permissions(uid: string) {
    const doc = await this.db.collection('user').doc(uid).collection('settings').doc('permissions').get();

    return doc.exists ? (doc.data() ?? {}) : {};
  }

  // ==========================================================
  // USER
  // ==========================================================

  private async getUser(uid: string) {
    const doc = await this.db.collection('user').doc(uid).get();

    if (!doc.exists) {
      throw new BadRequestException('User not found');
    }

    return {
      uid: doc.id,

      ...doc.data(),
    } as any;
  }

  // ==========================================================
  // ROOT ID
  // ==========================================================

  private getRootId(user: any): string {
    /*
     * Root manager / root / admin:
     * their own UID is the organization root
     * unless rootId explicitly exists.
     */
    if (['root_manager', 'root', 'admin'].includes(user.role)) {
      return user.rootId || user.uid;
    }

    /*
     * Normal HR must have rootId.
     */
    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    return user.rootId;
  }

  // ==========================================================
  // DATE
  // ==========================================================

  private resolveDashboardDate(requestedDate?: string): string {
    if (!requestedDate) {
      return this.resolveToday();
    }

    const value = String(requestedDate).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Invalid date. Expected YYYY-MM-DD');
    }

    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException('Invalid dashboard date');
    }

    return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('');
  }

  private resolveToday(): string {
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone: HrDashboardService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(new Date());

    return value.replace(/-/g, '');
  }

  private dashboardDateToIso(date: string): string {
    if (!/^\d{8}$/.test(date)) {
      throw new BadRequestException('Invalid dashboard date');
    }

    return [date.substring(0, 4), date.substring(4, 6), date.substring(6, 8)].join('-');
  }

  private addDaysToIsoDate(date: string, days: number): string {
    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    parsed.setUTCDate(parsed.getUTCDate() + days);

    return parsed.toISOString().slice(0, 10);
  }

  // ==========================================================
  // SERIALIZE DATE
  // ==========================================================

  private serializeDate(value: any): string | undefined {
    if (!value) {
      return undefined;
    }

    let date: Date;

    if (value && typeof value.toDate === 'function') {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date.toISOString();
  }
}
