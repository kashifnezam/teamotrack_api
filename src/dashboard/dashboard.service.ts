import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { DashboardDto, DashboardScopeType } from './dto/dashboard.dto';

import { FirebaseService } from '../firebase/firebase.service';

import { LeaveService } from '../leave/leave.service';

import { HolidayService } from '../holiday/holiday.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  /*
   * IMPORTANT:
   *
   * Manager dashboard intentionally includes:
   *
   * - field executives
   * - child managers
   * - HR
   *
   * Do NOT reduce this to field_executive only.
   */
  private static readonly STAFF_ROLES = ['field_executive', 'manager', 'hr'];

  constructor(
    private readonly firebase: FirebaseService,

    /*
     * Existing Leave business logic.
     */
    private readonly leaveService: LeaveService,

    /*
     * Existing Holiday business logic.
     */
    private readonly holidayService: HolidayService
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==========================================================
  // MAIN DASHBOARD
  // ==========================================================

  async getDashboardData(user: any, requestedDate?: string): Promise<DashboardDto> {
    try {
      // ------------------------------------------------------
      // VALIDATE USER
      // ------------------------------------------------------

      const uid = user?.uid ?? user?.id;

      if (!uid) {
        throw new BadRequestException('User UID is missing');
      }

      if (!this.db) {
        throw new InternalServerErrorException('Firestore unavailable');
      }

      // ------------------------------------------------------
      // ALWAYS LOAD FRESH USER DOCUMENT
      // ------------------------------------------------------

      const currentUser = await this.getUser(uid);

      // ------------------------------------------------------
      // ROOT
      // ------------------------------------------------------

      const rootId = this.getRootId(currentUser);

      // ------------------------------------------------------
      // DASHBOARD DATE
      // ------------------------------------------------------

      const date = this.resolveDashboardDate(requestedDate);

      this.logger.log(
        `Dashboard fetch | uid=${currentUser.uid} | role=${currentUser.role} | root=${rootId} | date=${date}`
      );

      // ======================================================
      // LOAD ORGANIZATION USERS
      // ======================================================

      const userSnapshot = await this.db.collection('user').where('rootId', '==', rootId).get();

      const users = userSnapshot.docs.map((doc) => ({
        id: doc.id,

        ...doc.data(),
      })) as any[];

      /*
       * Root users may not contain rootId.
       */
      if (this.isRoot(currentUser)) {
        const rootExists = users.some((item) => (item.uid || item.id) === currentUser.uid);

        if (!rootExists) {
          users.push(currentUser);
        }
      }

      // ======================================================
      // LOAD TEAMS
      // ======================================================

      const teams = await this.loadTeams(rootId);

      // ======================================================
      // ATTACH TEAM INFORMATION
      // ======================================================

      const enrichedUsers = users.map((item) => this.enrichTeam(item, teams));

      // ======================================================
      // DETERMINE AUTHORIZED STAFF
      // ======================================================

      /*
       * IMPORTANT:
       *
       * Existing manager visibility is preserved.
       *
       * Manager:
       *   executives
       *   child managers
       *   HR
       *
       * HR:
       *   authorized executives only
       *
       * Executive:
       *   self
       */
      const visibleStaff = this.getVisibleStaff(currentUser, enrichedUsers);

      this.logger.log(
        `Dashboard visibility | uid=${currentUser.uid} | role=${currentUser.role} | staff=${visibleStaff.length}`
      );

      // ======================================================
      // ATTENDANCE
      // ======================================================

      /*
       * IMPORTANT:
       *
       * loadAttendance ONLY reads existing
       * attendance records.
       *
       * Missing record =
       * not_marked
       *
       * Never infer absent.
       */
      const attendanceMap = await this.loadAttendance(visibleStaff, date);

      const todayAttendance = attendanceMap.get(date) ?? new Map<string, any>();

      // ======================================================
      // STAFF ROWS
      // ======================================================

      const staff = visibleStaff.map((item) => {
        const staffId = item.uid || item.id;

        const attendance = todayAttendance.get(staffId);

        return this.buildStaffRow(item, attendance);
      });

      // ======================================================
      // ATTENDANCE SUMMARY
      // ======================================================

      const attendance = this.calculateAttendance(staff);

      // ======================================================
      // TRACKING
      // ======================================================

      const tracking = this.calculateTracking(staff);

      // ======================================================
      // FILTER OPTIONS
      // ======================================================

      /*
       * Filters are generated from the complete
       * authorized staff list.
       *
       * Existing manager behavior is preserved.
       */
      const filterOptions = this.getFilterOptions(visibleStaff, enrichedUsers);

      // ======================================================
      // SCOPE
      // ======================================================

      const scope = this.getScope(currentUser, staff.length);

      // ======================================================
      // RESULT
      // ======================================================

      const result: DashboardDto = {
        user: {
          id: currentUser.uid,

          fullName: currentUser.fullName ?? currentUser.userName ?? currentUser.name ?? 'User',

          role: currentUser.role ?? '',
        },

        scope,

        date,

        filters: filterOptions,

        attendance,

        tracking,

        staff,
      };

      // ======================================================
      // HR DASHBOARD
      // ======================================================

      /*
       * HR gets additional dashboard information.
       *
       * Manager response remains unchanged.
       */
      if (currentUser.role === 'hr') {
        await this.buildHrDashboard(currentUser, visibleStaff, date, todayAttendance);
      }

      // ======================================================
      // LOG
      // ======================================================

      this.logger.log(
        `Dashboard ready | uid=${currentUser.uid} | role=${currentUser.role} | total=${attendance.total} | marked=${attendance.marked} | notMarked=${attendance.notMarked} | present=${attendance.present} | working=${attendance.working} | late=${attendance.late} | leave=${attendance.leave} | absent=${attendance.absent} | weeklyOff=${attendance.weeklyOff} | holiday=${attendance.holiday} | online=${tracking.online}`
      );

      return result;
    } catch (error) {
      const uid = user?.uid ?? user?.id ?? 'unknown';

      this.logger.error(
        `Dashboard fetch failed | uid=${uid} | ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to load dashboard');
    }
  }

  // ==========================================================
  // HR DASHBOARD
  // ==========================================================

  private async buildHrDashboard(user: any, staff: any[], date: string, todayAttendance: Map<string, any>) {
    /*
     * These operations are independent,
     * so execute them concurrently.
     */
    // const [pendingLeave, exceptions, holidays] = await Promise.all([
    //   // this.loadPendingLeave(user),

    //   // this.loadAttendanceExceptions(staff, todayAttendance, date),

    //   // this.loadUpcomingHolidays(user, date),
    // ]);

    return {
      // pendingLeave,
      // exceptions,
      // holidays,
    };
  }

  // ==========================================================
  // HR - PENDING LEAVE
  // ==========================================================

  private async loadPendingLeave(user: any) {
    /*
     * Reuse LeaveService authorization.
     *
     * For HR this internally checks:
     *
     * leave.approve.all
     *
     * and only returns requests where
     * the HR user is the current approver.
     *
     * This prevents DashboardService from
     * duplicating leave approval logic.
     */
    const result = await this.leaveService.getApprovals(user.uid);

    return result?.approvals ?? [];
  }

  // ==========================================================
  // HR - ATTENDANCE EXCEPTIONS
  // ==========================================================

  private async loadAttendanceExceptions(staff: any[], todayAttendance: Map<string, any>, date: string) {
    const exceptions: any[] = [];

    for (const employee of staff) {
      const staffId = employee.uid ?? employee.id;

      const attendance = todayAttendance.get(staffId);

      if (!attendance) {
        continue;
      }

      const exception = this.getAttendanceException(attendance);

      if (!exception) {
        continue;
      }

      exceptions.push({
        id: `${staffId}_${date}`,

        userId: staffId,

        fullName: employee.fullName ?? employee.userName ?? employee.name ?? 'Unknown',

        role: employee.role ?? '',

        date,

        ...exception,
      });
    }

    return exceptions;
  }

  // ==========================================================
  // ATTENDANCE EXCEPTION
  // ==========================================================

  private getAttendanceException(attendance: any) {
    if (!attendance) {
      return null;
    }

    /*
     * --------------------------------------------------------
     * EXPLICIT EXCEPTION DATA
     * --------------------------------------------------------
     *
     * If the attendance service already stores
     * an explicit exception, preserve it.
     */

    if (Array.isArray(attendance.exceptions) && attendance.exceptions.length) {
      return {
        type: 'attendance',
        label: 'Attendance exception',
        details: attendance.exceptions,
      };
    }

    if (attendance.exception && typeof attendance.exception === 'object') {
      return {
        type: attendance.exception.type ?? 'attendance',
        label: attendance.exception.label ?? 'Attendance exception',
        details: attendance.exception,
      };
    }

    /*
     * --------------------------------------------------------
     * PUNCTUALITY
     * --------------------------------------------------------
     *
     * Late is already calculated by the
     * attendance service/scheduler.
     *
     * Dashboard does NOT recalculate grace
     * period or shift time.
     */

    if (attendance.punctuality === 'late') {
      return {
        type: 'late',

        label: 'Late arrival',

        punctuality: 'late',
      };
    }

    /*
     * No exception.
     */
    return null;
  }

  // ==========================================================
  // HR - UPCOMING HOLIDAYS
  // ==========================================================

  private async loadUpcomingHolidays(user: any, date: string) {
    /*
     * Dashboard date is YYYYMMDD.
     *
     * HolidayService expects:
     * YYYY-MM-DD
     */
    const startDate = this.dashboardDateToIso(date);

    /*
     * Show the next 30 calendar days.
     *
     * This keeps the dashboard lightweight
     * while providing useful upcoming holidays.
     */
    const endDate = this.addDaysToIsoDate(startDate, 30);

    const result = await this.holidayService.getRange(user.uid, startDate, endDate);

    return result?.holidays ?? [];
  }

  // ==========================================================
  // VISIBLE STAFF
  // ==========================================================

  private getVisibleStaff(user: any, users: any[]): any[] {
    // --------------------------------------------------------
    // ROOT
    // --------------------------------------------------------

    if (this.isRoot(user)) {
      /*
       * Preserve existing root behavior.
       */
      return users.filter((item) => DashboardService.STAFF_ROLES.includes(item.role));
    }

    // --------------------------------------------------------
    // FIELD EXECUTIVE
    // --------------------------------------------------------

    if (user.role === 'field_executive') {
      return users.filter((item) => (item.uid || item.id) === user.uid);
    }

    // --------------------------------------------------------
    // HR
    // --------------------------------------------------------

    /*
     * HR is NOT a recursive hierarchy node.
     *
     * HR sees field executives associated
     * with the same parent relationship.
     *
     * This preserves the existing TeamoTrack
     * hierarchy model.
     */
    if (user.role === 'hr') {
      return users.filter((item) => item.role === 'field_executive' && item.parentId === user.parentId);
    }

    // --------------------------------------------------------
    // MANAGER
    // --------------------------------------------------------

    /*
     * Manager hierarchy remains recursive.
     *
     * This intentionally includes:
     *
     * - field executives
     * - child managers
     * - HR
     */
    const byParent = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      const list = byParent.get(item.parentId) ?? [];

      list.push(item);

      byParent.set(item.parentId, list);
    }

    const result: any[] = [];

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      const children = byParent.get(parentId) ?? [];

      for (const child of children) {
        /*
         * IMPORTANT:
         *
         * Keep existing manager response.
         */
        if (DashboardService.STAFF_ROLES.includes(child.role)) {
          result.push(child);
        }

        /*
         * Only managers continue
         * recursively.
         *
         * HR does not become another
         * hierarchy node.
         */
        if (child.role === 'manager') {
          walk(child.uid || child.id);
        }
      }
    };

    walk(user.uid);

    return result;
  }

  // ==========================================================
  // LOAD TEAMS
  // ==========================================================

  private async loadTeams(rootId: string): Promise<Map<string, any>> {
    const result = new Map<string, any>();

    const snapshot = await this.db.collection('teams').where('rootId', '==', rootId).get();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      result.set(doc.id, {
        id: doc.id,

        ...data,
      });
    });

    return result;
  }

  // ==========================================================
  // ENRICH TEAM
  // ==========================================================

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
  // FILTER OPTIONS
  // ==========================================================

  private getFilterOptions(visibleStaff: any[], allUsers: any[]) {
    // --------------------------------------------------------
    // TEAMS
    // --------------------------------------------------------

    const teams = new Map<string, string>();

    for (const item of visibleStaff) {
      if (!item.teamId) {
        continue;
      }

      const name = item.teamName ?? 'Unnamed Team';

      teams.set(item.teamId, name);
    }

    // --------------------------------------------------------
    // MANAGERS
    // --------------------------------------------------------

    const managerIds = new Set<string>();

    for (const item of visibleStaff) {
      const itemId = item.uid || item.id;

      /*
       * Preserve manager filtering
       * behavior.
       */
      if (item.role === 'manager') {
        managerIds.add(itemId);
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
  // LOAD ATTENDANCE
  // ==========================================================

  private async loadAttendance(staff: any[], date: string): Promise<Map<string, Map<string, any>>> {
    const attendanceMap = new Map<string, Map<string, any>>();

    const dateMap = new Map<string, any>();

    attendanceMap.set(date, dateMap);

    if (!staff.length) {
      return attendanceMap;
    }

    // --------------------------------------------------------
    // BUILD REFERENCES
    // --------------------------------------------------------

    const refs = staff.map((item) => {
      const staffId = item.uid || item.id;

      return this.db.collection('attendance').doc(staffId).collection('records').doc(date);
    });

    // --------------------------------------------------------
    // BATCH READ
    // --------------------------------------------------------

    const snapshots = await this.db.getAll(...refs);

    snapshots.forEach((doc, index) => {
      /*
       * Missing attendance remains
       * not_marked.
       */
      if (!doc.exists) {
        return;
      }

      const staffId = staff[index].uid || staff[index].id;

      dateMap.set(staffId, {
        id: doc.id,

        ...(doc.data() ?? {}),
      });
    });

    return attendanceMap;
  }

  // ==========================================================
  // STAFF ROW
  // ==========================================================

  private buildStaffRow(user: any, attendance: any) {
    const staffId = user.uid || user.id;

    const status = this.getAttendanceStatus(attendance);

    const currLoc = this.getLocation(user);

    const result: any = {
      id: staffId,

      fullName: user.fullName ?? user.userName ?? user.name ?? 'Unknown',

      role: user.role ?? '',

      status,
    };

    // --------------------------------------------------------
    // TEAM
    // --------------------------------------------------------

    if (user.teamId) {
      result.teamId = user.teamId;
    }

    if (user.teamName) {
      result.teamName = user.teamName;
    }

    // --------------------------------------------------------
    // MANAGER
    // --------------------------------------------------------

    if (user.parentId) {
      result.managerId = user.parentId;
    }

    if (user.managerName) {
      result.managerName = user.managerName;
    }

    // --------------------------------------------------------
    // ATTENDANCE
    // --------------------------------------------------------

    if (attendance?.checkInTime) {
      const checkIn = this.serializeDate(attendance.checkInTime);

      if (checkIn) {
        result.checkIn = checkIn;
      }
    }

    if (attendance?.checkOutTime) {
      const checkOut = this.serializeDate(attendance.checkOutTime);

      if (checkOut) {
        result.checkOut = checkOut;
      }
    }

    if (attendance?.workingMinutes != null) {
      result.workingMinutes = Number(attendance.workingMinutes);
    }

    // --------------------------------------------------------
    // ATTENDANCE TYPE
    // --------------------------------------------------------

    if (attendance?.attendanceType === 'full_day' || attendance?.attendanceType === 'half_day') {
      result.attendanceType = attendance.attendanceType;
    }

    // --------------------------------------------------------
    // PUNCTUALITY
    // --------------------------------------------------------

    if (attendance?.punctuality === 'on_time' || attendance?.punctuality === 'late') {
      result.punctuality = attendance.punctuality;
    }

    // --------------------------------------------------------
    // LEAVE
    // --------------------------------------------------------

    if (attendance?.leaveDuration) {
      result.leaveDuration = attendance.leaveDuration;
    }

    if (attendance?.leaveTypeId) {
      result.leaveTypeId = attendance.leaveTypeId;
    }

    // --------------------------------------------------------
    // LOCATION
    // --------------------------------------------------------

    if (currLoc) {
      result.currLoc = currLoc;
    }

    return result;
  }

  // ==========================================================
  // ATTENDANCE STATUS
  // ==========================================================

  private getAttendanceStatus(
    attendance: any
  ): 'not_marked' | 'present' | 'working' | 'late' | 'leave' | 'absent' | 'weekly_off' | 'holiday' {
    /*
     * NO RECORD
     *
     * = NOT MARKED
     */
    if (!attendance) {
      return 'not_marked';
    }

    // --------------------------------------------------------
    // EXPLICIT TERMINAL STATES
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // ACTIVE WORK
    // --------------------------------------------------------

    if (attendance.checkInTime && !attendance.checkOutTime) {
      return 'working';
    }

    // --------------------------------------------------------
    // LATE
    // --------------------------------------------------------

    if (attendance.punctuality === 'late') {
      return 'late';
    }

    // --------------------------------------------------------
    // PRESENT
    // --------------------------------------------------------

    if (attendance.status === 'present') {
      return 'present';
    }

    // --------------------------------------------------------
    // BACKWARD COMPATIBILITY
    // --------------------------------------------------------

    if (attendance.checkInTime) {
      return 'present';
    }

    return 'not_marked';
  }

  // ==========================================================
  // ATTENDANCE CALCULATION
  // ==========================================================

  private calculateAttendance(staff: any[]) {
    const total = staff.length;

    // --------------------------------------------------------
    // PRESENT
    // --------------------------------------------------------

    const present = staff.filter(
      (item) => item.status === 'present' || item.status === 'working' || item.status === 'late'
    ).length;

    // --------------------------------------------------------
    // WORKING
    // --------------------------------------------------------

    const working = staff.filter((item) => item.status === 'working').length;

    // --------------------------------------------------------
    // LATE
    // --------------------------------------------------------

    const late = staff.filter((item) => item.status === 'late').length;

    // --------------------------------------------------------
    // LEAVE
    // --------------------------------------------------------

    const leave = staff.filter((item) => item.status === 'leave').length;

    // --------------------------------------------------------
    // ABSENT
    // --------------------------------------------------------

    const absent = staff.filter((item) => item.status === 'absent').length;

    // --------------------------------------------------------
    // WEEKLY OFF
    // --------------------------------------------------------

    const weeklyOff = staff.filter((item) => item.status === 'weekly_off').length;

    // --------------------------------------------------------
    // HOLIDAY
    // --------------------------------------------------------

    const holiday = staff.filter((item) => item.status === 'holiday').length;

    // --------------------------------------------------------
    // NOT MARKED
    // --------------------------------------------------------

    const notMarked = staff.filter((item) => item.status === 'not_marked').length;

    /*
     * Actual attendance outcomes.
     */
    const marked = present + leave + absent + weeklyOff + holiday;

    /*
     * Present percentage is based on
     * marked records only.
     */
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
      battery: loc?.battery ?? undefined,
      ts: this.formatLocationTimestamp(loc?.ts),
    };
  }

  private formatLocationTimestamp(ts: any): string | undefined {
    if (ts == null) {
      return undefined;
    }

    const timestamp = new Date(ts).getTime();

    if (!Number.isFinite(timestamp)) {
      return undefined;
    }

    const now = Date.now();
    const diffMs = Math.max(0, now - timestamp);

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    // Less than 1 minute
    if (diffMs < minute) {
      return 'just now';
    }

    // Minutes
    if (diffMs < hour) {
      const minutes = Math.floor(diffMs / minute);
      return `${minutes} min ago`;
    }

    // Hours
    if (diffMs < day) {
      const hours = Math.floor(diffMs / hour);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }

    // Up to 7 days
    if (diffMs <= 7 * day) {
      const days = Math.floor(diffMs / day);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }

    // More than 7 days -> actual date
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // ==========================================================
  // SCOPE
  // ==========================================================

  private getScope(user: any, total: number) {
    let type: DashboardScopeType;

    let label: string;

    if (this.isRoot(user)) {
      type = 'organization';

      label = 'Entire Organization';
    } else if (user.role === 'field_executive') {
      type = 'self';

      label = 'My Dashboard';
    } else if (user.role === 'hr') {
      type = 'hierarchy';

      label = 'Authorized Staff';
    } else {
      type = 'hierarchy';

      label = 'My Team';
    }

    return {
      type,

      label,

      totalStaff: total,
    };
  }

  // ==========================================================
  // ROOT
  // ==========================================================

  private isRoot(user: any): boolean {
    return ['root', 'admin', 'root_manager', 'root_hr'].includes(user?.role);
  }

  // ==========================================================
  // ROOT ID
  // ==========================================================

  private getRootId(user: any): string {
    if (this.isRoot(user)) {
      return user.rootId || user.uid;
    }

    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    return user.rootId;
  }

  // ==========================================================
  // TODAY
  // ==========================================================

  private resolveToday(): string {
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone: DashboardService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(new Date());

    /*
     * YYYY-MM-DD
     *
     * becomes
     *
     * YYYYMMDD
     */
    return value.replace(/-/g, '');
  }

  // ==========================================================
  // SERIALIZE DATE
  // ==========================================================

  private serializeDate(value: any): string | undefined {
    if (!value) {
      return undefined;
    }

    let date: Date;

    if (typeof value.toDate === 'function') {
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
  // DASHBOARD DATE
  // ==========================================================

  private resolveDashboardDate(requestedDate?: string): string {
    /*
     * No requested date:
     *
     * Use today in India.
     */
    if (!requestedDate) {
      return this.resolveToday();
    }

    const value = String(requestedDate).trim();

    /*
     * Accept:
     *
     * YYYY-MM-DD
     */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Invalid date. Expected YYYY-MM-DD');
    }

    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    /*
     * Prevent invalid dates:
     *
     * 2026-02-31
     */
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException('Invalid dashboard date');
    }

    /*
     * YYYYMMDD
     */
    return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('');
  }

  // ==========================================================
  // DASHBOARD DATE -> ISO
  // ==========================================================

  private dashboardDateToIso(date: string): string {
    if (!/^\d{8}$/.test(date)) {
      throw new BadRequestException('Invalid dashboard date');
    }

    return [date.substring(0, 4), date.substring(4, 6), date.substring(6, 8)].join('-');
  }

  // ==========================================================
  // ADD DAYS
  // ==========================================================

  private addDaysToIsoDate(date: string, days: number): string {
    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    parsed.setUTCDate(parsed.getUTCDate() + days);

    return parsed.toISOString().slice(0, 10);
  }
}
