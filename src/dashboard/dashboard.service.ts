import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { DashboardDto, DashboardScopeType } from './dto/dashboard.dto';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  private static readonly STAFF_ROLES = ['field_executive', 'manager', 'hr'];

  constructor(private readonly firebase: FirebaseService) {}

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
        this.logger.log(user);
      if (!user?.uid && !user?.id) {
        throw new BadRequestException('User UID is missing');
      }

      if (!this.db) {
        throw new InternalServerErrorException('Firestore unavailable');
      }

      // ------------------------------------------------------
      // ALWAYS LOAD FRESH USER DOCUMENT
      // ------------------------------------------------------

      const currentUser = await this.getUser(user.uid);

      // ------------------------------------------------------
      // ROOT
      // ------------------------------------------------------

      const rootId = this.getRootId(currentUser);

      // ------------------------------------------------------
      // TODAY
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
       * Root users may not have rootId.
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
       * loadAttendance only reads existing attendance
       * documents.
       *
       * It NEVER creates attendance.
       *
       * Therefore:
       *
       * no document = not_marked
       *
       * The dashboard must never infer "absent".
       */

      const attendanceMap = await this.loadAttendance(visibleStaff, date);

      const todayAttendance = attendanceMap.get(date) || new Map<string, any>();

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
       * Filter options are generated from the COMPLETE
       * authorized staff list.
       *
       * NOT from an already-filtered list.
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

      this.logger.log(
        `Dashboard ready | uid=${currentUser.uid} | role=${currentUser.role} | total=${attendance.total} | marked=${attendance.marked} | notMarked=${attendance.notMarked} | present=${attendance.present} | working=${attendance.working} | late=${attendance.late} | leave=${attendance.leave} | absent=${attendance.absent} | weeklyOff=${attendance.weeklyOff} | holiday=${attendance.holiday} | online=${tracking.online}`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Dashboard fetch failed | uid=${user?.uid ?? 'unknown'} | ${
          error instanceof Error ? error.message : String(error)
        }`,
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
  // VISIBLE STAFF
  // ==========================================================

  private getVisibleStaff(user: any, users: any[]): any[] {
    // --------------------------------------------------------
    // ROOT
    // --------------------------------------------------------

    if (this.isRoot(user)) {
      return users.filter((item) => DashboardService.STAFF_ROLES.includes(item.role));
    }

    // --------------------------------------------------------
    // FIELD EXECUTIVE
    // --------------------------------------------------------

    if (user.role === 'field_executive') {
      return users.filter((item) => (item.uid || item.id) === user.uid);
    }

    // --------------------------------------------------------
    // BUILD PARENT MAP
    // --------------------------------------------------------

    const byParent = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      if (!byParent.has(item.parentId)) {
        byParent.set(item.parentId, []);
      }

      byParent.get(item.parentId)!.push(item);
    }

    // --------------------------------------------------------
    // MANAGER / HR
    // --------------------------------------------------------

    const result: any[] = [];

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      for (const child of byParent.get(parentId) || []) {
        /*
         * Dashboard includes actual
         * attendance staff.
         */

        if (DashboardService.STAFF_ROLES.includes(child.role)) {
          result.push(child);
        }

        /*
         * Manager hierarchy is recursive.
         *
         * HR is NOT a recursive hierarchy node.
         */

        if (child.role === 'manager') {
          walk(child.uid || child.id);
        }
      }
    };

    walk(user.uid);

    // --------------------------------------------------------
    // HR
    // --------------------------------------------------------

    /*
     * HR does not inherit recursive
     * manager hierarchy.
     *
     * Current model:
     *
     * HR sees field executives directly
     * under the same parent relationship.
     */

    if (user.role === 'hr') {
      return result.filter((item) => item.role === 'field_executive' && item.parentId === user.parentId);
    }

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

      const name = item.teamName || 'Unnamed Team';

      teams.set(item.teamId, name);
    }

    // --------------------------------------------------------
    // MANAGERS
    // --------------------------------------------------------

    const managerIds = new Set<string>();

    for (const item of visibleStaff) {
      const itemId = item.uid || item.id;

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
  // LOAD TODAY ATTENDANCE
  // ==========================================================

  private async loadAttendance(staff: any[], date: string): Promise<Map<string, Map<string, any>>> {
    /*
     * REQUIRED STRUCTURE:
     *
     * attendanceMap
     *    date
     *       staffId
     *          attendance
     */

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

    /*
     * Batched Firestore read.
     */

    const snapshots = await this.db.getAll(...refs);

    snapshots.forEach((doc, index) => {
      /*
       * IMPORTANT:
       *
       * Missing document means
       * there is no attendance yet.
       *
       * We deliberately DO NOT insert
       * an absent record here.
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

    /*
     * Do not invent attendanceType.
     *
     * It only exists when the attendance
     * service/scheduler actually calculated it.
     */

    if (attendance?.attendanceType === 'full_day' || attendance?.attendanceType === 'half_day') {
      result.attendanceType = attendance.attendanceType;
    }

    // --------------------------------------------------------
    // PUNCTUALITY
    // --------------------------------------------------------

    /*
     * Late is based on the attendance
     * service's punctuality calculation.
     *
     * Dashboard does NOT independently
     * calculate late.
     */

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
     * ========================================================
     * CRITICAL RULE
     * ========================================================
     *
     * NO ATTENDANCE RECORD
     * =
     * NOT MARKED
     *
     * NEVER:
     *
     * no record -> absent
     *
     * "absent" must come from an actual
     * attendance document.
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

    /*
     * Checked in but not checked out.
     *
     * The person is currently working.
     */

    if (attendance.checkInTime && !attendance.checkOutTime) {
      return 'working';
    }

    // --------------------------------------------------------
    // PUNCTUALITY
    // --------------------------------------------------------

    /*
     * Late is independent from present.
     *
     * Example:
     *
     * status       = present
     * punctuality  = late
     *
     * Dashboard should display late.
     */

    if (attendance.punctuality === 'late') {
      return 'late';
    }

    // --------------------------------------------------------
    // PRESENT
    // --------------------------------------------------------

    if (attendance.status === 'present') {
      return 'present';
    }

    /*
     * Backward compatibility:
     *
     * Older attendance records may contain
     * checkInTime but no status.
     *
     * Since attendance definitely occurred,
     * treat it as present rather than absent.
     */

    if (attendance.checkInTime) {
      return 'present';
    }

    /*
     * Attendance document exists but does
     * not contain enough information.
     *
     * Do NOT infer absent.
     */

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

    /*
     * "present" means attendance occurred.
     *
     * Working and late are also attendance.
     */

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

    /*
     * Only explicitly marked absent
     * employees are counted.
     */

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
     * Marked attendance means an actual
     * attendance outcome exists.
     *
     * not_marked is excluded.
     */

    const marked = present + leave + absent + weeklyOff + holiday;

    /*
     * Attendance percentage:
     *
     * Present / marked records
     *
     * Employees with no attendance record
     * are excluded.
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
    };
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
     * Attendance document IDs are:
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
     * Prevent invalid dates such as:
     *
     * 2026-02-31
     */

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException('Invalid dashboard date');
    }

    /*
     * Firestore attendance record IDs
     * use YYYYMMDD.
     */

    return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('');
  }
}
