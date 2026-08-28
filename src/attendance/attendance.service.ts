import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';

import { AttendanceDto } from './dto/attendance.dto';

import {
  AttendanceStatus,
  LeaveInfo,
  ProcessingSummary,
  RunLog,
  ShiftConfig,
  Staff,
  UserDocument,
} from './interfaces/attendance-processing.interface';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  private static readonly BATCH_SIZE = 450;

  private static readonly ATTENDANCE_ROLES = new Set(['field_executive', 'manager', 'hr']);

  private static readonly ROOT_ROLES = new Set(['root', 'admin', 'root_manager', 'root_hr']);

  private static readonly TERMINAL_STATUSES = new Set(['present', 'absent', 'leave', 'weekly_off', 'holiday']);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ============================================================
  // GET ATTENDANCE DATA
  // ============================================================

  async getData(requesterId: string, dto: AttendanceDto) {
    const requester = await this.getUser(requesterId);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    this.validateMonthYear(dto.month, dto.year);

    const staff = await this.getStaffForAttendanceView(requester, dto.staffId);

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    const start = this.localDate(`${dto.year}-${String(dto.month).padStart(2, '0')}-01`);

    const endDate = new Date(Date.UTC(dto.year, dto.month, 1));

    const end = new Date(
      `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00+05:30`
    );

    try {
      const snapshot = await this.db
        .collection('attendance')
        .doc(dto.staffId)
        .collection('records')
        .where('date', '>=', start)
        .where('date', '<', end)
        .get();

      const records = snapshot.docs.map((doc) => this.mapRecord(doc));

      records.sort((a, b) => {
        const dateA = this.recordDateValue(a.date);
        const dateB = this.recordDateValue(b.date);

        return dateB - dateA;
      });

      return {
        records,
        summary: this.getSummary(records),
      };
    } catch (error) {
      this.logger.error(
        `Attendance fetch failed | staff=${dto.staffId} | ${dto.year}-${dto.month}`,
        error instanceof Error ? error.stack : String(error)
      );

      throw error;
    }
  }

  // ============================================================
  // MY ATTENDANCE
  // ============================================================

  async getMyData(userId: string, month: number, year: number) {
    const user = await this.getUser(userId);

    this.assertAttendanceStaff(user);

    this.validateMonthYear(month, year);

    const start = this.localDate(`${year}-${String(month).padStart(2, '0')}-01`);

    const nextMonth = new Date(Date.UTC(year, month, 1));

    const end = new Date(
      `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00+05:30`
    );

    const snapshot = await this.db
      .collection('attendance')
      .doc(userId)
      .collection('records')
      .where('date', '>=', start)
      .where('date', '<', end)
      .get();

    const records = snapshot.docs.map((doc) => this.mapRecord(doc));

    records.sort((a, b) => this.recordDateValue(b.date) - this.recordDateValue(a.date));

    return {
      records,
      summary: this.getSummary(records),
    };
  }

  // ============================================================
  // CHECK IN
  // ============================================================

  async checkIn(
    userId: string,
    dto: {
      lat?: number;
      lng?: number;
    }
  ) {
    const user = await this.getUser(userId);

    this.assertAttendanceStaff(user);

    const rootId = this.getRootId(user);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * Location is compulsory ONLY when tracking
     * is enabled for this user.
     */
    if (user.isTrackingEnable === true) {
      this.validateLocation(dto.lat, dto.lng);
    } else {
      /*
       * If location is supplied even though tracking
       * is disabled, validate it before saving.
       */
      if (dto.lat != null || dto.lng != null) {
        this.validateLocation(dto.lat, dto.lng);
      }
    }

    const date = this.todayIndia();

    const recordId = this.dateKey(date);

    const ref = this.attendanceRecordRef(userId, date);

    const shift = await this.resolveUserShift(user);

    if (!shift) {
      throw new BadRequestException('No applicable shift found');
    }

    const now = new Date();

    const shiftStart = this.shiftStartForDate(now, shift);

    const shiftEnd = this.shiftEndForDate(now, shift);

    /*
     * Early check-in IS allowed.
     *
     * But after shift end, check-in is rejected.
     */
    if (now.getTime() >= shiftEnd.getTime()) {
      throw new BadRequestException('Your shift has already ended. Check-in is no longer available.');
    }

    /*
     * Punctuality is based on:
     *
     * shift start + grace period
     */
    const punctuality = this.isLate(now, shift) ? 'late' : 'on_time';

    let result:
      | {
          status: AttendanceStatus;
          attendanceType: 'full_day' | 'half_day';
          punctuality: 'on_time' | 'late';
          message: string;
        }
      | undefined;

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      const existing = snapshot.exists ? (snapshot.data() ?? {}) : {};

      /*
       * Already checked in.
       */
      if (existing.checkInTime) {
        throw new ConflictException('You have already checked in today');
      }

      /*
       * Full-day leave cannot be overridden.
       */
      if (existing.status === 'leave' && existing.leaveDuration !== 'half_day') {
        throw new BadRequestException('You are on full-day leave today');
      }

      /*
       * Weekly off / holiday cannot be overridden.
       */
      if (existing.status === 'weekly_off' || existing.status === 'holiday') {
        throw new BadRequestException(`Attendance is already marked as ${existing.status}`);
      }

      const data: FirebaseFirestore.DocumentData = {
        staffId: userId,

        rootId,

        date: this.localDate(date),

        checkInTime: FieldValue.serverTimestamp(),

        status: 'present',

        attendanceType: 'full_day',

        punctuality,

        workingMinutes: 0,

        /*
         * Snapshot the shift that was actually
         * applicable at check-in.
         */
        shiftSnapshot: shift,

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * Preserve half-day leave.
       */
      if (existing.leaveDuration === 'half_day') {
        data.leaveDuration = 'half_day';

        if (existing.leaveTypeId) {
          data.leaveTypeId = existing.leaveTypeId;
        }
      }

      /*
       * Save check-in location when supplied.
       */
      if (dto.lat != null && dto.lng != null) {
        data.checkInLocation = {
          lat: Number(dto.lat),
          lng: Number(dto.lng),
        };
      }

      transaction.set(ref, data, {
        merge: true,
      });

      result = {
        status: 'present',

        attendanceType: 'full_day',

        punctuality,

        message:
          punctuality === 'late'
            ? 'Check-in recorded. You are late.'
            : now.getTime() < shiftStart.getTime()
              ? 'Early check-in recorded successfully.'
              : 'Check-in recorded successfully.',
      };
    });

    if (!result) {
      throw new InternalServerErrorException('Unable to record check-in');
    }

    return {
      id: recordId,

      staffId: userId,

      date,

      ...result,

      workingMinutes: 0,

      checkInTime: now.toISOString(),
    };
  }

  // ============================================================
  // CHECK OUT
  // ============================================================

  async checkOut(
    userId: string,
    dto: {
      lat?: number;
      lng?: number;
    }
  ) {
    const user = await this.getUser(userId);

    this.assertAttendanceStaff(user);

    const rootId = this.getRootId(user);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * Location compulsory only for tracking-enabled users.
     */
    if (user.isTrackingEnable === true) {
      this.validateLocation(dto.lat, dto.lng);
    } else if (dto.lat != null || dto.lng != null) {
      this.validateLocation(dto.lat, dto.lng);
    }

    const date = this.todayIndia();

    const recordId = this.dateKey(date);

    const ref = this.attendanceRecordRef(userId, date);

    let result:
      | {
          checkInTime: Date;
          checkOutTime: Date;
          workingMinutes: number;
          status: AttendanceStatus;
          attendanceType: 'full_day' | 'half_day' | null;
          punctuality: 'on_time' | 'late';
          message: string;
        }
      | undefined;

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        throw new NotFoundException('No attendance check-in found for today');
      }

      const existing = snapshot.data() ?? {};

      if (!existing.checkInTime) {
        throw new BadRequestException('You have not checked in today');
      }

      if (existing.checkOutTime) {
        throw new ConflictException('You have already checked out today');
      }

      const checkIn = this.toDate(existing.checkInTime);

      if (!checkIn) {
        throw new InternalServerErrorException('Invalid check-in time');
      }

      /*
       * IMPORTANT:
       *
       * Checkout MUST use the historical
       * shift snapshot stored at check-in.
       *
       * Never use the current team shift here.
       */
      const shift = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (!shift) {
        throw new InternalServerErrorException('Historical shift information is missing from attendance record');
      }

      const checkOut = new Date();

      /*
       * Early check-in does NOT count toward
       * working minutes.
       *
       * Example:
       *
       * Shift      = 09:00
       * Check-in   = 08:30
       * Check-out  = 17:30
       *
       * Working    = 08:30
       */
      const shiftStart = this.shiftStartForDate(checkIn, shift);

      const effectiveCheckIn = checkIn.getTime() < shiftStart.getTime() ? shiftStart : checkIn;

      const workingMinutes = Math.max(0, Math.round((checkOut.getTime() - effectiveCheckIn.getTime()) / 60000));

      /*
       * Use the SAME classification rule as the scheduler.
       *
       * Example:
       * fullDayMinutes = 480
       * halfDayMinutes = 240
       * graceMinutes   = 15
       *
       * Full day = 495 minutes
       * Half day = 255 minutes
       * Below 255 = absent
       */
      const classification = this.classifyWorkingMinutes(workingMinutes, shift);

      const status = classification.status;

      const attendanceType = classification.attendanceType;

      /*
       * Always calculate punctuality from the
       * historical shift snapshot.
       */
      const punctuality = this.isLate(checkIn, shift) ? 'late' : 'on_time';

      const update: FirebaseFirestore.DocumentData = {
        checkOutTime: FieldValue.serverTimestamp(),

        workingMinutes,

        status,

        attendanceType,

        punctuality,

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * Preserve half-day leave.
       */
      if (existing.leaveDuration === 'half_day') {
        update.leaveDuration = 'half_day';

        if (existing.leaveTypeId) {
          update.leaveTypeId = existing.leaveTypeId;
        }
      }

      /*
       * Historical shift MUST remain untouched.
       */
      if (!existing.shiftSnapshot) {
        update.shiftSnapshot = shift;
      }

      /*
       * Optional checkout location.
       */
      if (dto.lat != null && dto.lng != null) {
        update.checkOutLocation = {
          lat: Number(dto.lat),
          lng: Number(dto.lng),
        };
      }

      transaction.set(ref, update, {
        merge: true,
      });

      result = {
        checkInTime: checkIn,

        checkOutTime: checkOut,

        workingMinutes,

        status,

        attendanceType,

        punctuality,

        message: 'Check-out recorded successfully.',
      };
    });

    if (!result) {
      throw new InternalServerErrorException('Unable to record check-out');
    }

    return {
      id: recordId,

      staffId: userId,

      date,

      status: result.status,

      attendanceType: result.attendanceType,

      punctuality: result.punctuality,

      checkInTime: result.checkInTime.toISOString(),

      checkOutTime: result.checkOutTime.toISOString(),

      workingMinutes: result.workingMinutes,

      message: result.message,
    };
  }

  // ============================================================
  // MANUAL / SCHEDULER ENTRY POINT
  // ============================================================

  async processAttendanceForDate(
    date: string,
    options: {
      mode: 'automatic' | 'manual';
      triggeredBy: string;
      rootId?: string;
    }
  ) {
    this.logger.log(`[ATTENDANCE] START | date=${date} | mode=${options.mode} | triggeredBy=${options.triggeredBy}`);

    this.validateProcessingDate(date);

    if (options.rootId) {
      return this.processOrganizationDate(options.rootId, date, options.mode, options.triggeredBy);
    }

    const staff = await this.loadAttendanceStaff();

    const grouped = this.groupByRootId(staff);

    const results: ProcessingSummary[] = [];

    for (const [rootId] of grouped) {
      const result = await this.processOrganizationDate(rootId, date, options.mode, options.triggeredBy);

      this.logger.log(
        `[ATTENDANCE] ORGANIZATION COMPLETE | root=${rootId} | date=${date} | processed=${result.processed} | created=${result.created} | updated=${result.updated} | skipped=${result.skipped} | errors=${result.errors.length}`
      );

      results.push(result);
    }

    return this.mergeSummaries(date, results);
  }

  // ============================================================
  // ORGANIZATION PROCESSOR
  // ============================================================

  private async processOrganizationDate(
    rootId: string,
    date: string,
    mode: 'automatic' | 'manual',
    triggeredBy: string
  ): Promise<ProcessingSummary> {
    const lock = await this.acquireRun(rootId, date, mode, triggeredBy);

    if (!lock) {
      throw new ConflictException(`Attendance processing is already running for ${date}`);
    }

    const summary: ProcessingSummary = {
      date,

      processed: 0,

      created: 0,

      updated: 0,

      skipped: 0,

      errors: [],
    };

    try {
      const staff = (await this.loadAttendanceStaff()).filter((x) => x.rootId === rootId);

      if (!staff.length) {
        await this.completeRun(rootId, date, summary);

        return summary;
      }

      const teams = await this.loadTeams(staff);

      const shifts = await this.loadShifts(staff, teams);

      const holidays = await this.loadHoliday(rootId, date);

      const leaves = await this.loadApprovedLeaves(rootId, date);

      const attendance = await this.loadAttendanceRecords(staff, date);

      const operations: Array<{
        staff: Staff;

        ref: FirebaseFirestore.DocumentReference;

        existing?: FirebaseFirestore.DocumentData;

        update?: FirebaseFirestore.DocumentData;

        create?: FirebaseFirestore.DocumentData;
      }> = [];

      for (const employee of staff) {
        summary.processed++;

        try {
          /*
           * IMPORTANT:
           *
           * If an attendance record already exists,
           * its shiftSnapshot has absolute priority.
           *
           * This is what makes processing an older date
           * safe after the team/user shift has changed.
           *
           * Current team/user shift is used ONLY
           * when no historical snapshot exists.
           */
          const existing = attendance.get(employee.uid);

          const shift = this.resolveHistoricalOrCurrentShift(existing, employee, teams, shifts);

          const leave = leaves.get(employee.uid);

          const decision = this.calculateAttendance(employee, date, shift, existing, leave, holidays);

          const ref = this.db.collection('attendance').doc(employee.uid).collection('records').doc(this.dateKey(date));

          if (decision.action === 'skip') {
            summary.skipped++;

            continue;
          }

          if (decision.action === 'create') {
            summary.created++;

            operations.push({
              staff: employee,

              ref,

              create: decision.data,
            });
          } else {
            summary.updated++;

            operations.push({
              staff: employee,

              ref,

              existing,

              update: decision.data,
            });
          }
        } catch (error) {
          summary.errors.push({
            staffId: employee.uid,

            error: error instanceof Error ? error.message : String(error),
          });

          this.logger.error(
            `Attendance staff processing failed | root=${rootId} | staff=${employee.uid} | date=${date}`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      }

      await this.commitOperations(operations);

      await this.completeRun(rootId, date, summary);

      return summary;
    } catch (error) {
      await this.failRun(rootId, date, summary, error);

      throw error;
    }
  }

  // ============================================================
  // STAFF LOADING
  // ============================================================

  private async loadAttendanceStaff(): Promise<Staff[]> {
    const snapshot = await this.db.collection('user').where('isActive', '==', true).get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();

        return {
          uid: doc.id,

          rootId: data.rootId,

          role: data.role,

          parentId: data.parentId,

          teamId: data.teamId,

          shiftId: data.shiftId,

          isActive: data.isActive,

          isTrackingEnable: data.isTrackingEnable === true,

          userName: data.userName ?? data.name,

          fullName: data.fullName ?? data.userName ?? data.name,
        } as Staff;
      })
      .filter((user) => !!user.rootId && AttendanceService.ATTENDANCE_ROLES.has(user.role ?? ''));
  }

  private groupByRootId(staff: Staff[]) {
    const map = new Map<string, Staff[]>();

    for (const user of staff) {
      const current = map.get(user.rootId) ?? [];

      current.push(user);

      map.set(user.rootId, current);
    }

    return map;
  }

  // ============================================================
  // TEAM PRELOAD
  // ============================================================

  private async loadTeams(staff: Staff[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
    const ids = [...new Set(staff.map((x) => x.teamId).filter((x): x is string => !!x))];

    if (!ids.length) {
      return new Map();
    }

    const refs = ids.map((id) => this.db.collection('teams').doc(id));

    const snapshots = await this.db.getAll(...refs);

    return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data()!]));
  }

  // ============================================================
  // SHIFT PRELOAD
  // ============================================================

  private async loadShifts(
    staff: Staff[],
    teams: Map<string, FirebaseFirestore.DocumentData>
  ): Promise<Map<string, ShiftConfig>> {
    const ids = new Set<string>();

    for (const user of staff) {
      /*
       * Manager / HR / any direct shift
       * takes priority.
       */
      if (user.shiftId) {
        ids.add(user.shiftId);

        continue;
      }

      /*
       * Team-based executive.
       */
      if (user.teamId) {
        const team = teams.get(user.teamId);

        if (team?.shiftId) {
          ids.add(team.shiftId);
        }
      }
    }

    if (!ids.size) {
      return new Map();
    }

    const refs = [...ids].map((id) => this.db.collection('shifts').doc(id));

    const snapshots = await this.db.getAll(...refs);

    const result = new Map<string, ShiftConfig>();

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }

      const data = snapshot.data()!;

      result.set(snapshot.id, this.mapShift(snapshot.id, data));
    }

    return result;
  }

  private async loadShiftById(shiftId: string): Promise<ShiftConfig | undefined> {
    const snapshot = await this.db.collection('shifts').doc(shiftId).get();

    if (!snapshot.exists) {
      return undefined;
    }

    return this.mapShift(snapshot.id, snapshot.data() ?? {});
  }

  private mapShift(id: string, data: FirebaseFirestore.DocumentData): ShiftConfig {
    return {
      shiftId: id,

      startHour: Number(data.startHour ?? 0),

      startMinute: Number(data.startMinute ?? 0),

      endHour: Number(data.endHour ?? 0),

      endMinute: Number(data.endMinute ?? 0),

      graceMinutes: Number(data.graceMinutes ?? 0),

      halfDayMinutes: Number(data.halfDayMinutes ?? 240),

      fullDayMinutes: Number(data.fullDayMinutes ?? 480),

      weeklyOff: Array.isArray(data.weeklyOff) ? data.weeklyOff : [],
    };
  }

  // ============================================================
  // HISTORICAL SHIFT RESOLUTION
  // ============================================================

  private resolveHistoricalOrCurrentShift(
    existing: FirebaseFirestore.DocumentData | undefined,
    staff: Staff,
    teams: Map<string, FirebaseFirestore.DocumentData>,
    shifts: Map<string, ShiftConfig>
  ): ShiftConfig | undefined {
    /*
     * HIGHEST PRIORITY:
     *
     * Historical shift snapshot already stored
     * on this attendance record.
     */
    if (existing?.shiftSnapshot) {
      const historical = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (historical) {
        return historical;
      }
    }

    /*
     * No snapshot:
     *
     * resolve the shift that is currently
     * applicable to this staff member.
     */
    return this.resolveShift(staff, teams, shifts);
  }

  private shiftFromSnapshot(snapshot: any): ShiftConfig | undefined {
    if (!snapshot || typeof snapshot !== 'object') {
      return undefined;
    }

    /*
     * Zero is valid for midnight, so use null/undefined checks.
     */
    if (
      snapshot.startHour == null ||
      snapshot.startMinute == null ||
      snapshot.endHour == null ||
      snapshot.endMinute == null
    ) {
      return undefined;
    }

    const shift = this.mapShift(String(snapshot.shiftId ?? snapshot.id ?? 'historical'), snapshot);

    if (
      !Number.isFinite(shift.startHour) ||
      !Number.isFinite(shift.startMinute) ||
      !Number.isFinite(shift.endHour) ||
      !Number.isFinite(shift.endMinute) ||
      !Number.isFinite(shift.graceMinutes) ||
      !Number.isFinite(shift.halfDayMinutes) ||
      !Number.isFinite(shift.fullDayMinutes)
    ) {
      return undefined;
    }

    return shift;
  }

  // ============================================================
  // CURRENT SHIFT RESOLUTION
  // ============================================================

  private resolveShift(
    staff: Staff,
    teams: Map<string, FirebaseFirestore.DocumentData>,
    shifts: Map<string, ShiftConfig>
  ): ShiftConfig | undefined {
    /*
     * Direct shift has priority.
     *
     * This is important for manager / HR.
     */
    if (staff.shiftId) {
      return shifts.get(staff.shiftId);
    }

    /*
     * Team-based staff.
     *
     * Primarily field executives.
     */
    if (staff.teamId) {
      const team = teams.get(staff.teamId);

      if (team?.shiftId) {
        return shifts.get(team.shiftId);
      }
    }

    return undefined;
  }

  private async resolveUserShift(user: any): Promise<ShiftConfig | undefined> {
    /*
     * Manager / HR:
     *
     * Direct user.shiftId.
     */
    if (user.shiftId && (user.role === 'manager' || user.role === 'hr')) {
      return this.loadShiftById(user.shiftId);
    }

    /*
     * Any direct shift.
     */
    if (user.shiftId) {
      return this.loadShiftById(user.shiftId);
    }

    /*
     * Team-based executive.
     */
    if (user.teamId) {
      const snapshot = await this.db.collection('teams').doc(user.teamId).get();

      if (!snapshot.exists) {
        return undefined;
      }

      const team = snapshot.data() ?? {};

      if (!team.shiftId) {
        return undefined;
      }

      return this.loadShiftById(team.shiftId);
    }

    return undefined;
  }

  // ============================================================
  // HOLIDAY
  // ============================================================

  private async loadHoliday(rootId: string, date: string): Promise<boolean> {
    const snapshot = await this.db.collection('companyHolidays').where('rootId', '==', rootId).get();

    return snapshot.docs.some((doc) => {
      const data = doc.data();

      return data.active === true && data.date === date;
    });
  }

  // ============================================================
  // LEAVE
  // ============================================================

  private async loadApprovedLeaves(rootId: string, date: string): Promise<Map<string, LeaveInfo>> {
    const snapshot = await this.db.collection('leaves').where('rootId', '==', rootId).get();

    const result = new Map<string, LeaveInfo>();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (String(data.status ?? '').toLowerCase() !== 'approved') {
        continue;
      }

      if (!data.startDate || !data.endDate) {
        continue;
      }

      if (date < String(data.startDate) || date > String(data.endDate)) {
        continue;
      }

      const duration = data.duration === 'half_day' ? 'half_day' : 'day';

      result.set(data.userId, {
        userId: data.userId,

        leaveTypeId: data.leaveTypeId,

        startDate: data.startDate,

        endDate: data.endDate,

        days: data.days,

        status: data.status,

        duration,
      });
    }

    return result;
  }

  // ============================================================
  // ATTENDANCE PRELOAD
  // ============================================================

  private async loadAttendanceRecords(
    staff: Staff[],
    date: string
  ): Promise<Map<string, FirebaseFirestore.DocumentData>> {
    const refs = staff.map((user) => this.attendanceRecordRef(user.uid, date));

    const result = new Map<string, FirebaseFirestore.DocumentData>();

    for (let i = 0; i < refs.length; i += 100) {
      const chunk = refs.slice(i, i + 100);

      const snapshots = await this.db.getAll(...chunk);

      for (let index = 0; index < snapshots.length; index++) {
        const snapshot = snapshots[index];

        if (snapshot.exists) {
          result.set(staff[i + index].uid, snapshot.data()!);
        }
      }
    }

    return result;
  }

  // ============================================================
  // BUSINESS DECISION
  // ============================================================

  private calculateAttendance(
    staff: Staff,
    date: string,
    shift: ShiftConfig | undefined,
    existing: FirebaseFirestore.DocumentData | undefined,
    leave: LeaveInfo | undefined,
    holiday: boolean
  ):
    | {
        action: 'skip';
      }
    | {
        action: 'create';
        data: FirebaseFirestore.DocumentData;
      }
    | {
        action: 'update';
        data: FirebaseFirestore.DocumentData;
      } {
    /*
     * No applicable shift.
     */
    if (!shift) {
      if (existing) {
        return {
          action: 'skip',
        };
      }

      throw new Error('No applicable shift found');
    }

    /*
     * ========================================================
     * ACTIVE ATTENDANCE
     * ========================================================
     *
     * Do NOT modify actual check-in time.
     *
     * But derived fields such as punctuality
     * can be corrected.
     */
    if (existing?.checkInTime && !existing?.checkOutTime) {
      const checkIn = this.toDate(existing.checkInTime);

      if (!checkIn) {
        return {
          action: 'skip',
        };
      }

      const punctuality = this.isLate(checkIn, shift) ? 'late' : 'on_time';

      const update: FirebaseFirestore.DocumentData = {
        status: 'present',

        /*
         * Duration is not final until checkout.
         */
        punctuality,

        workingMinutes: 0,

        /*
         * Only add snapshot if the
         * old record somehow does not
         * have one.
         */
        ...(!existing.shiftSnapshot
          ? {
              shiftSnapshot: shift,
            }
          : {}),

        updatedAt: FieldValue.serverTimestamp(),
      };

      if (leave?.duration === 'half_day') {
        update.leaveDuration = 'half_day';

        update.leaveTypeId = leave.leaveTypeId;
      }

      return {
        action: 'update',
        data: update,
      };
    }

    /*
     * ========================================================
     * COMPLETED ATTENDANCE
     * ========================================================
     *
     * Recalculate using the historical
     * shift snapshot.
     */
    if (existing?.checkInTime && existing?.checkOutTime) {
      return {
        action: 'update',

        data: this.classifyCompletedAttendance(existing, shift, leave),
      };
    }

    /*
     * ========================================================
     * FULL-DAY LEAVE
     * ========================================================
     */
    if (leave && leave.duration !== 'half_day') {
      return {
        action: existing ? 'update' : 'create',

        data: this.leaveRecord(staff, date, shift, leave),
      };
    }

    /*
     * ========================================================
     * HALF-DAY LEAVE
     * ========================================================
     */
    if (leave?.duration === 'half_day') {
      return {
        action: existing ? 'update' : 'create',

        data: this.halfDayLeaveRecord(staff, date, shift, leave),
      };
    }

    /*
     * ========================================================
     * COMPANY HOLIDAY
     * ========================================================
     */
    if (holiday) {
      return {
        action: existing ? 'update' : 'create',

        data: {
          staffId: staff.uid,

          date: this.localDate(date),

          status: 'holiday',

          workingMinutes: 0,

          shiftSnapshot: shift,

          rootId: staff.rootId,

          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    }

    /*
     * ========================================================
     * WEEKLY OFF
     * ========================================================
     */
    if (this.isWeeklyOff(date, shift)) {
      return {
        action: existing ? 'update' : 'create',

        data: {
          staffId: staff.uid,

          date: this.localDate(date),

          status: 'weekly_off',

          workingMinutes: 0,

          shiftSnapshot: shift,

          rootId: staff.rootId,

          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    }

    /*
     * ========================================================
     * EXISTING TERMINAL RECORD
     * ========================================================
     *
     * Leave / holiday / weekly-off have already been handled.
     * A normal scheduler-generated absent/present record without
     * timestamps is already final for this processing run.
     */
    if (existing && this.isTerminalStatus(existing.status)) {
      return {
        action: 'skip',
      };
    }

    /*
     * ========================================================
     * ABSENT
     * ========================================================
     */
    return {
      action: existing ? 'update' : 'create',

      data: {
        staffId: staff.uid,

        date: this.localDate(date),

        status: 'absent',

        workingMinutes: 0,

        shiftSnapshot: shift,

        rootId: staff.rootId,

        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  }

  // ============================================================
  // COMPLETED ATTENDANCE
  // ============================================================

  private classifyCompletedAttendance(
    attendance: FirebaseFirestore.DocumentData,
    shift: ShiftConfig,
    leave?: LeaveInfo
  ) {
    const checkIn = this.toDate(attendance.checkInTime);

    const checkOut = this.toDate(attendance.checkOutTime);

    if (!checkIn || !checkOut) {
      return {};
    }

    /*
     * Early check-in does NOT count toward working minutes.
     *
     * Effective start =
     * max(actual check-in, shift start)
     */
    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const effectiveCheckIn = checkIn.getTime() < shiftStart.getTime() ? shiftStart : checkIn;

    const workingMinutes = Math.max(0, Math.round((checkOut.getTime() - effectiveCheckIn.getTime()) / 60000));

    /*
     * IMPORTANT:
     *
     * Scheduler/manual processing uses exactly the
     * same classification function as checkout.
     */
    const classification = this.classifyWorkingMinutes(workingMinutes, shift);

    /*
     * Always recalculate punctuality from the
     * historical shift snapshot.
     */
    const punctuality = this.isLate(checkIn, shift) ? 'late' : 'on_time';

    const update: FirebaseFirestore.DocumentData = {
      status: classification.status,

      workingMinutes,

      punctuality,

      updatedAt: FieldValue.serverTimestamp(),
    };

    /*
     * Absent means the employee did not reach the
     * half-day threshold, so do not retain a stale
     * full_day/half_day attendanceType.
     */
    if (classification.attendanceType) {
      update.attendanceType = classification.attendanceType;
    } else {
      update.attendanceType = FieldValue.delete();
    }

    /*
     * Historical shift snapshot is authoritative.
     * Never replace an existing snapshot.
     */
    if (!attendance.shiftSnapshot) {
      update.shiftSnapshot = shift;
    }

    /*
     * Preserve half-day leave metadata.
     */
    if (leave?.duration === 'half_day') {
      update.leaveDuration = 'half_day';

      update.leaveTypeId = leave.leaveTypeId;
    }

    return update;
  }

  // ============================================================
  // WORKING-MINUTE CLASSIFICATION
  // ============================================================

  private classifyWorkingMinutes(
    workingMinutes: number,
    shift: ShiftConfig
  ): {
    status: AttendanceStatus;
    attendanceType: 'full_day' | 'half_day' | null;
  } {
    /*
     * Grace is added to BOTH duration thresholds.
     *
     * Example:
     *
     * fullDayMinutes = 480
     * halfDayMinutes = 240
     * graceMinutes   = 15
     *
     * fullDayThreshold = 495
     * halfDayThreshold = 255
     *
     * < 255       => absent
     * 255 - 494   => present + half_day
     * >= 495      => present + full_day
     */
    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    const fullDayThreshold = Math.max(0, Number(shift.fullDayMinutes ?? 480)) + graceMinutes;

    const halfDayThreshold = Math.max(0, Number(shift.halfDayMinutes ?? 240)) + graceMinutes;

    if (workingMinutes >= fullDayThreshold) {
      return {
        status: 'present',
        attendanceType: 'full_day',
      };
    }

    if (workingMinutes >= halfDayThreshold) {
      return {
        status: 'present',
        attendanceType: 'half_day',
      };
    }

    return {
      status: 'absent',
      attendanceType: null,
    };
  }

  // ============================================================
  // LEAVE RECORDS
  // ============================================================

  private leaveRecord(staff: Staff, date: string, shift: ShiftConfig, leave: LeaveInfo) {
    return {
      staffId: staff.uid,

      date: this.localDate(date),

      status: 'leave',

      leaveDuration: 'day',

      leaveTypeId: leave.leaveTypeId,

      workingMinutes: 0,

      shiftSnapshot: shift,

      rootId: staff.rootId,

      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private halfDayLeaveRecord(staff: Staff, date: string, shift: ShiftConfig, leave: LeaveInfo) {
    return {
      staffId: staff.uid,

      date: this.localDate(date),

      status: 'leave',

      leaveDuration: 'half_day',

      leaveTypeId: leave.leaveTypeId,

      workingMinutes: 0,

      shiftSnapshot: shift,

      rootId: staff.rootId,

      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  // ============================================================
  // WRITE OPERATIONS
  // ============================================================

  private async commitOperations(
    operations: Array<{
      ref: FirebaseFirestore.DocumentReference;

      create?: FirebaseFirestore.DocumentData;

      update?: FirebaseFirestore.DocumentData;
    }>
  ) {
    for (let i = 0; i < operations.length; i += AttendanceService.BATCH_SIZE) {
      const chunk = operations.slice(i, i + AttendanceService.BATCH_SIZE);

      const batch = this.db.batch();

      for (const operation of chunk) {
        if (operation.create) {
          batch.set(
            operation.ref,
            {
              ...operation.create,

              createdAt: FieldValue.serverTimestamp(),

              updatedAt: FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            }
          );
        } else if (operation.update) {
          batch.set(operation.ref, operation.update, {
            merge: true,
          });
        }
      }

      await batch.commit();
    }
  }

  // ============================================================
  // RUN LOCK
  // ============================================================

  private runRef(rootId: string, date: string) {
    return this.db.collection('attendanceSchedulerRuns').doc(`${rootId}_${this.dateKey(date)}`);
  }

  private async acquireRun(
    rootId: string,
    date: string,
    mode: 'automatic' | 'manual',
    triggeredBy: string
  ): Promise<boolean> {
    const ref = this.runRef(rootId, date);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (snapshot.exists) {
        const data = snapshot.data()!;

        if (data.status === 'running') {
          return false;
        }
      }

      const run: RunLog = {
        rootId,

        date,

        mode,

        triggeredBy,

        status: 'running',

        startedAt: null,

        completedAt: null,

        processedStaff: 0,

        created: 0,

        updated: 0,

        skipped: 0,

        errors: 0,
      };

      transaction.set(
        ref,
        {
          ...run,

          startedAt: FieldValue.serverTimestamp(),

          completedAt: null,
        },
        {
          merge: true,
        }
      );

      return true;
    });
  }

  private async completeRun(rootId: string, date: string, summary: ProcessingSummary) {
    await this.runRef(rootId, date).set(
      {
        status: summary.errors.length ? 'partial_failed' : 'completed',

        completedAt: FieldValue.serverTimestamp(),

        processedStaff: summary.processed,

        created: summary.created,

        updated: summary.updated,

        skipped: summary.skipped,

        errors: summary.errors.length,
      },
      {
        merge: true,
      }
    );
  }

  private async failRun(rootId: string, date: string, summary: ProcessingSummary, error: unknown) {
    await this.runRef(rootId, date).set(
      {
        status: 'failed',

        completedAt: FieldValue.serverTimestamp(),

        processedStaff: summary.processed,

        created: summary.created,

        updated: summary.updated,

        skipped: summary.skipped,

        errors: summary.errors.length + 1,

        fatalError: error instanceof Error ? error.message : String(error),
      },
      {
        merge: true,
      }
    );
  }

  // ============================================================
  // AUTHORIZATION
  // ============================================================

  async assertCanProcess(userId: string) {
    const user = await this.getUser(userId);

    if (!AttendanceService.ROOT_ROLES.has(user.role!)) {
      throw new ForbiddenException('You are not authorized to process attendance');
    }

    // const rootId = this.getRootId(user);

    // if (!rootId) {
    //   throw new BadRequestException('Invalid hierarchy: rootId missing');
    // }

    return {
      ...user,
    };
  }

  // ============================================================
  // ATTENDANCE VIEW AUTHORIZATION
  // ============================================================

  private async getStaffForAttendanceView(requester: any, staffId: string) {
    const target = await this.getUser(staffId);

    const requesterRoot = this.getRootId(requester);

    const targetRoot = this.getRootId(target);

    if (!requesterRoot || !targetRoot || requesterRoot !== targetRoot) {
      throw new ForbiddenException('You are not authorized to view this attendance');
    }

    /*
     * Root authorities.
     */
    if (AttendanceService.ROOT_ROLES.has(requester.role!)) {
      return target;
    }

    /*
     * Executive.
     */
    if (requester.role === 'field_executive') {
      if (target.uid !== requester.uid) {
        throw new ForbiddenException('You can only view your own attendance');
      }

      return target;
    }

    /*
     * HR.
     */
    if (requester.role === 'hr') {
      const authorizedIds = this.getHrAuthorizedStaffIds(requester);

      if (authorizedIds.has(target.uid)) {
        return target;
      }

      if (target.uid === requester.uid) {
        return target;
      }

      throw new ForbiddenException('You are not authorized to view this staff attendance');
    }

    /*
     * Manager.
     */
    if (requester.role === 'manager') {
      const users = await this.loadRootUsers(requesterRoot);

      const descendants = this.getDescendantIds(requester.uid, users);

      if (target.uid === requester.uid || descendants.has(target.uid)) {
        return target;
      }

      throw new ForbiddenException('You are not authorized to view this staff attendance');
    }

    throw new ForbiddenException('You are not authorized to view this attendance');
  }

  private getHrAuthorizedStaffIds(user: any): Set<string> {
    const values = [
      ...(Array.isArray(user.authorizedStaffIds) ? user.authorizedStaffIds : []),

      ...(Array.isArray(user.staffIds) ? user.staffIds : []),
    ];

    return new Set(values.filter((x) => typeof x === 'string'));
  }

  private async loadRootUsers(rootId: string): Promise<any[]> {
    const snapshot = await this.db.collection('user').where('rootId', '==', rootId).get();

    return snapshot.docs.map((doc) => ({
      uid: doc.id,

      ...doc.data(),
    }));
  }

  private getDescendantIds(managerId: string, users: any[]): Set<string> {
    const children = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      if (!children.has(item.parentId)) {
        children.set(item.parentId, []);
      }

      children.get(item.parentId)!.push(item);
    }

    const ids = new Set<string>();

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      for (const child of children.get(parentId) || []) {
        const id = child.uid || child.id;

        if (!id || ids.has(id)) {
          continue;
        }

        ids.add(id);

        /*
         * Only managers continue recursively.
         */
        if (child.role === 'manager') {
          walk(id);
        }
      }
    };

    walk(managerId);

    return ids;
  }

  // ============================================================
  // USER HELPERS
  // ============================================================

  private async getUser(userId: string): Promise<UserDocument> {
    const doc = await this.db.collection('user').doc(userId).get();

    if (!doc.exists) {
      throw new NotFoundException('User not found');
    }

    const data = doc.data() ?? {};

    return {
      uid: doc.id,

      ...(data as Omit<UserDocument, 'uid'>),
    };
  }

  private getRootId(user: any): string | undefined {
    return user.rootId ?? (user.role === 'root' ? user.uid : undefined);
  }

  private assertAttendanceStaff(user: any) {
    if (!AttendanceService.ATTENDANCE_ROLES.has(user.role ?? '')) {
      throw new ForbiddenException('This account cannot record attendance');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Your account is inactive');
    }
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  private validateMonthYear(month: number, year: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month');
    }

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException('Invalid year');
    }
  }

  private validateLocation(lat?: number, lng?: number) {
    if (lat == null && lng == null) {
      throw new BadRequestException('Location is required');
    }

    if (lat == null || lng == null) {
      throw new BadRequestException('Both latitude and longitude are required');
    }

    const latitude = Number(lat);

    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Invalid location');
    }

    if (latitude < -90 || latitude > 90) {
      throw new BadRequestException('Invalid latitude');
    }

    if (longitude < -180 || longitude > 180) {
      throw new BadRequestException('Invalid longitude');
    }
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private validateProcessingDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const parsed = new Date(`${date}T00:00:00+05:30`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid processing date');
    }

    const today = this.todayIndia();

    if (date >= today) {
      throw new BadRequestException('Attendance can only be processed for a completed date');
    }
  }

  private todayIndia(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    return formatter.format(new Date());
  }

  private dateKey(date: string): string {
    return date.replace(/-/g, '');
  }

  private localDate(date: string): Date {
    return new Date(`${date}T00:00:00+05:30`);
  }

  private attendanceRecordRef(userId: string, date: string) {
    return this.db.collection('attendance').doc(userId).collection('records').doc(this.dateKey(date));
  }

  private getIndiaDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    return formatter.format(date);
  }

  private shiftStartForDate(date: Date, shift: ShiftConfig): Date {
    const localDate = this.getIndiaDateParts(date);

    return new Date(
      `${localDate}T${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}:00+05:30`
    );
  }

  private shiftEndForDate(date: Date, shift: ShiftConfig): Date {
    const localDate = this.getIndiaDateParts(date);

    const startMinutes = shift.startHour * 60 + shift.startMinute;

    const endMinutes = shift.endHour * 60 + shift.endMinute;

    /*
     * Support overnight shifts.
     *
     * Example:
     * 22:00 -> 06:00
     */
    if (endMinutes <= startMinutes) {
      const start = new Date(
        `${localDate}T${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(
          2,
          '0'
        )}:00+05:30`
      );

      return new Date(start.getTime() + 24 * 60 * 60 * 1000);
    }

    return new Date(
      `${localDate}T${String(shift.endHour).padStart(2, '0')}:${String(shift.endMinute).padStart(2, '0')}:00+05:30`
    );
  }

  private isWeeklyOff(date: string, shift: ShiftConfig): boolean {
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: AttendanceService.TIME_ZONE,

      weekday: 'long',
    }).format(this.localDate(date));

    return shift.weeklyOff.includes(day);
  }

  private isLate(checkIn: Date, shift: ShiftConfig): boolean {
    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    /*
     * Exactly at shift start + grace is on time.
     * Late begins only after the grace period has passed.
     */
    return checkIn.getTime() > shiftStart.getTime() + graceMinutes * 60000;
  }

  // ============================================================
  // DATA HELPERS
  // ============================================================

  private toDate(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (value instanceof Timestamp) {
      return value.toDate();
    }

    if (typeof value.toDate === 'function') {
      return value.toDate();
    }

    if (typeof value === 'object' && typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds ?? 0) / 1_000_000));
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private recordDateValue(value: any): number {
    const date = this.toDate(value);

    return date ? date.getTime() : 0;
  }

  private isTerminalStatus(status: string | undefined) {
    return AttendanceService.TERMINAL_STATUSES.has(status ?? '');
  }

  private mapRecord(doc: FirebaseFirestore.QueryDocumentSnapshot) {
    const data = doc.data();

    return {
      id: doc.id,

      date: data.date ?? null,

      checkInTime: data.checkInTime ?? null,

      checkOutTime: data.checkOutTime ?? null,

      workingMinutes: Number(data.workingMinutes ?? 0),

      status: data.status ?? 'absent',

      ...(data.attendanceType
        ? {
            attendanceType: data.attendanceType,
          }
        : {}),

      ...(data.punctuality
        ? {
            punctuality: data.punctuality,
          }
        : {}),

      ...(data.leaveDuration
        ? {
            leaveDuration: data.leaveDuration,
          }
        : {}),

      ...(data.leaveTypeId
        ? {
            leaveTypeId: data.leaveTypeId,
          }
        : {}),

      ...(data.shiftSnapshot
        ? {
            shiftSnapshot: data.shiftSnapshot,
          }
        : {}),
    };
  }

  private getSummary(records: any[]) {
    return {
      totalPresent: records.filter((x) => x.status === 'present').length,

      totalLate: records.filter((x) => x.punctuality === 'late').length,

      totalOnTime: records.filter((x) => x.punctuality === 'on_time').length,

      totalHalfDay: records.filter((x) => x.attendanceType === 'half_day').length,

      totalFullDay: records.filter((x) => x.attendanceType === 'full_day').length,

      totalWeeklyOff: records.filter((x) => x.status === 'weekly_off').length,

      totalHoliday: records.filter((x) => x.status === 'holiday').length,

      totalLeave: records.filter((x) => x.status === 'leave').length,

      totalAbsent: records.filter((x) => x.status === 'absent').length,

      totalWorkingMinutes: records.reduce((sum, x) => sum + (Number(x.workingMinutes) || 0), 0),
    };
  }

  // ============================================================
  // SUMMARY MERGE
  // ============================================================

  private mergeSummaries(date: string, summaries: ProcessingSummary[]): ProcessingSummary {
    return {
      date,

      processed: summaries.reduce((a, b) => a + b.processed, 0),

      created: summaries.reduce((a, b) => a + b.created, 0),

      updated: summaries.reduce((a, b) => a + b.updated, 0),

      skipped: summaries.reduce((a, b) => a + b.skipped, 0),

      errors: summaries.flatMap((x) => x.errors),
    };
  }
}
