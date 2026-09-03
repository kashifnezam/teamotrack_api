import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { AttendanceService } from './attendance.service';

import { ShiftConfig, UserDocument } from './interfaces/attendance-processing.interface';

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  /**
   * Number of employees processed by one scheduler chunk.
   *
   * This controls memory usage and keeps a very large
   * organization from being processed in one operation.
   */
  private static readonly STAFF_CHUNK_SIZE = 100;

  /**
   * Firestore allows a maximum of 500 operations per batch.
   *
   * Keep some safety margin.
   */
  private static readonly WRITE_BATCH_SIZE = 450;

  private static readonly RUN_COLLECTION = 'attendanceSchedulerRuns';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly attendanceService: AttendanceService
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  async assertCanProcess(userId: string) {
    const user = await this.getUser(userId);

    const allowedRoles = new Set(['root', 'root_manager', 'admin']);

    if (!allowedRoles.has(user.role ?? '')) {
      throw new ForbiddenException('Only the root manager can process attendance');
    }

    const rootId = this.getRootId(user);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    return {
      rootId,
      user,
    };
  }
  // ============================================================
  // MAIN SCHEDULER ENTRY POINT
  // ============================================================

  async processAttendanceForDate(
    date?: string,
    options?: {
      mode?: 'scheduled' | 'manual';
      triggeredBy?: string;
      rootId?: string;
    }
  ) {
    const processingDate = date ?? this.todayIndia();

    this.validateProcessingDate(processingDate);

    const runId = `${processingDate}_${Date.now()}`;

    const runRef = this.db.collection(AttendanceSchedulerService.RUN_COLLECTION).doc(runId);

    const startedAt = new Date();

    const summary = {
      runId,

      date: processingDate,

      organizations: 0,

      organizationsCompleted: 0,

      organizationsFailed: 0,

      staffProcessed: 0,

      recordsCreated: 0,

      recordsUpdated: 0,

      recordsSkipped: 0,

      errors: 0,

      startedAt: startedAt.toISOString(),

      completedAt: null as string | null,
    };

    await runRef.set({
      runId,

      date: processingDate,

      status: 'running',

      startedAt: FieldValue.serverTimestamp(),

      summary,
    });

    try {
      const rootIds = options?.rootId ? [options.rootId] : await this.loadOrganizationIds();

      summary.organizations = rootIds.length;

      this.logger.log(`Attendance scheduler started | date=${processingDate} | organizations=${rootIds.length}`);

      for (const rootId of rootIds) {
        try {
          const organizationSummary = await this.processOrganizationDate(rootId, processingDate);

          summary.organizationsCompleted += 1;

          summary.staffProcessed += organizationSummary.staffProcessed;

          summary.recordsCreated += organizationSummary.recordsCreated;

          summary.recordsUpdated += organizationSummary.recordsUpdated;

          summary.recordsSkipped += organizationSummary.recordsSkipped;

          summary.errors += organizationSummary.errors;
        } catch (error) {
          summary.organizationsFailed += 1;

          summary.errors += 1;

          this.logger.error(
            `Attendance organization processing failed | rootId=${rootId} | date=${processingDate}`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      }

      summary.completedAt = new Date().toISOString();

      await runRef.update({
        status: 'completed',

        completedAt: FieldValue.serverTimestamp(),

        summary,
      });

      this.logger.log(
        `Attendance scheduler completed | date=${processingDate} | staff=${summary.staffProcessed} | created=${summary.recordsCreated} | updated=${summary.recordsUpdated} | skipped=${summary.recordsSkipped} | errors=${summary.errors}`
      );

      return summary;
    } catch (error) {
      summary.completedAt = new Date().toISOString();

      await runRef.update({
        status: 'failed',

        completedAt: FieldValue.serverTimestamp(),

        error: error instanceof Error ? error.message : String(error),

        summary,
      });

      this.logger.error(
        `Attendance scheduler failed | date=${processingDate}`,
        error instanceof Error ? error.stack : String(error)
      );

      throw error;
    }
  }

  // ============================================================
  // ORGANIZATION PROCESSING
  // ============================================================

  private async processOrganizationDate(rootId: string, date: string) {
    const summary = {
      rootId,

      date,

      staffProcessed: 0,

      recordsCreated: 0,

      recordsUpdated: 0,

      recordsSkipped: 0,

      errors: 0,
    };

    /*
     * Load all staff belonging to this organization.
     */
    const staff = await this.loadAttendanceStaff(rootId);

    if (!staff.length) {
      return summary;
    }

    /*
     * Load teams and shifts once for the
     * organization instead of querying them
     * for every employee.
     */
    const teams = await this.loadTeams(rootId);

    const shifts = await this.loadShifts(rootId);

    /*
     * Load holiday for the processing date.
     *
     * Leave is intentionally NOT loaded here.
     *
     * Approved leave will be represented directly
     * on attendance documents by LeaveService.
     */
    const holiday = await this.loadHoliday(rootId, date);

    /*
     * Load existing attendance records for
     * this date.
     */
    const attendanceRecords = await this.loadAttendanceRecords(staff, date);

    /*
     * Process employees in chunks.
     */
    for (let index = 0; index < staff.length; index += AttendanceSchedulerService.STAFF_CHUNK_SIZE) {
      const chunk = staff.slice(index, index + AttendanceSchedulerService.STAFF_CHUNK_SIZE);

      const chunkSummary = await this.processStaffChunk(rootId, date, chunk, teams, shifts, holiday, attendanceRecords);

      summary.staffProcessed += chunkSummary.staffProcessed;

      summary.recordsCreated += chunkSummary.recordsCreated;

      summary.recordsUpdated += chunkSummary.recordsUpdated;

      summary.recordsSkipped += chunkSummary.recordsSkipped;

      summary.errors += chunkSummary.errors;

      this.logger.debug(
        `Attendance chunk completed | rootId=${rootId} | date=${date} | processed=${Math.min(index + chunk.length, staff.length)}/${staff.length}`
      );
    }

    return summary;
  }

  // ============================================================
  // STAFF CHUNK
  // ============================================================

  private async processStaffChunk(
    rootId: string,
    date: string,
    staff: UserDocument[],
    teams: Map<string, any>,
    shifts: Map<string, ShiftConfig>,
    holiday: any | null,
    attendanceRecords: Map<string, any>
  ) {
    const summary = {
      staffProcessed: 0,

      recordsCreated: 0,

      recordsUpdated: 0,

      recordsSkipped: 0,

      errors: 0,
    };

    const operations: Array<{
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.DocumentData;
      type: 'create' | 'update';
    }> = [];

    for (const staffMember of staff) {
      try {
        const existing = attendanceRecords.get(staffMember.uid);

        /*
         * Important:
         *
         * LeaveService will create/update
         * approved leave attendance records.
         *
         * Scheduler must never replace an
         * already approved leave record.
         */
        if (existing?.leaveStatus === 'approved' && existing?.leaveRequestId) {
          summary.recordsSkipped += 1;

          summary.staffProcessed += 1;

          continue;
        }

        const shift = this.resolveShift(staffMember, teams, shifts, existing);

        const calculated = this.calculateAttendance(staffMember, date, existing, shift, holiday);

        if (calculated.action === 'skip') {
          summary.recordsSkipped += 1;
          summary.staffProcessed += 1;

          continue;
        }

        if (!calculated.data) {
          summary.recordsSkipped += 1;
          summary.staffProcessed += 1;

          this.logger.warn(`Attendance calculation returned no data | staff=${staffMember.uid} | date=${date}`);

          continue;
        }

        const ref = this.attendanceRecordRef(staffMember.uid, date);

        operations.push({
          ref,

          data: calculated.data,

          type: calculated.action,
        });

        if (calculated.action === 'create') {
          summary.recordsCreated += 1;
        } else {
          summary.recordsUpdated += 1;
        }

        summary.staffProcessed += 1;
      } catch (error) {
        summary.errors += 1;

        summary.staffProcessed += 1;

        this.logger.error(
          `Attendance employee processing failed | rootId=${rootId} | staff=${staffMember.uid} | date=${date}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
    }

    /*
     * Commit this chunk in Firestore-safe
     * batches of <= 450 operations.
     */
    await this.commitOperations(operations);

    return summary;
  }

  // ============================================================
  // ATTENDANCE CALCULATION
  // ============================================================

  private calculateAttendance(
    staff: UserDocument,
    date: string,
    existing: any | undefined,
    shift: ShiftConfig | undefined,
    holiday: any | null
  ): {
    action: 'create' | 'update' | 'skip';

    data?: FirebaseFirestore.DocumentData;
  } {
    /*
     * ----------------------------------------------------------
     * ACTIVE CHECK-IN
     * ----------------------------------------------------------
     *
     * Never replace an active employee attendance
     * record with absent/holiday/weekly-off.
     */
    if (existing?.checkInTime && !existing?.checkOutTime) {
      const punctuality = shift
        ? this.calculatePunctuality(existing.checkInTime, shift)
        : (existing.punctuality ?? 'on_time');

      const data: FirebaseFirestore.DocumentData = {
        updatedAt: FieldValue.serverTimestamp(),

        punctuality,
      };

      /*
       * Preserve the leave information if this
       * is a half-day approved leave record.
       */
      if (existing.leaveDuration === 'half_day') {
        data.leaveDuration = 'half_day';

        if (existing.leaveTypeId) {
          data.leaveTypeId = existing.leaveTypeId;
        }

        if (existing.leaveRequestId) {
          data.leaveRequestId = existing.leaveRequestId;
        }

        if (existing.leaveStatus) {
          data.leaveStatus = existing.leaveStatus;
        }
      }

      return {
        action: 'update',

        data,
      };
    }

    /*
     * ----------------------------------------------------------
     * COMPLETED ATTENDANCE
     * ----------------------------------------------------------
     */
    if (existing?.checkInTime && existing?.checkOutTime) {
      /*
       * Do not touch already terminal
       * attendance unless it is still an
       * active leave synchronization.
       */
      if (
        existing.status === 'present' ||
        existing.status === 'absent' ||
        existing.status === 'leave' ||
        existing.status === 'weekly_off' ||
        existing.status === 'holiday'
      ) {
        return {
          action: 'skip',
        };
      }

      if (!shift) {
        return {
          action: 'skip',
        };
      }

      const workingMinutes = this.calculateWorkingMinutes(existing.checkInTime, existing.checkOutTime, shift);

      const classification = this.attendanceService.classifyWorkingMinutes(workingMinutes, shift);

      return {
        action: 'update',

        data: {
          status: classification.status,

          attendanceType: classification.attendanceType,

          workingMinutes,

          punctuality: this.calculatePunctuality(existing.checkInTime, shift),

          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    }

    /*
     * ----------------------------------------------------------
     * HOLIDAY
     * ----------------------------------------------------------
     */
    if (holiday) {
      return {
        action: existing ? 'update' : 'create',

        data: this.holidayRecord(staff, date, holiday, existing),
      };
    }

    /*
     * ----------------------------------------------------------
     * WEEKLY OFF
     * ----------------------------------------------------------
     */
    if (shift && this.isWeeklyOff(date, shift)) {
      return {
        action: existing ? 'update' : 'create',

        data: this.weeklyOffRecord(staff, date, shift, existing),
      };
    }

    /*
     * ----------------------------------------------------------
     * NO ATTENDANCE
     * ----------------------------------------------------------
     *
     * No check-in and no approved leave
     * attendance means absent.
     */
    return {
      action: existing ? 'update' : 'create',

      data: this.absentRecord(staff, date, shift, existing),
    };
  }

  // ============================================================
  // RECORD BUILDERS
  // ============================================================

  private holidayRecord(staff: UserDocument, date: string, holiday: any, existing?: any) {
    return {
      staffId: staff.uid,

      rootId: this.getRootId(staff),

      date: this.localDate(date),

      status: 'holiday',

      attendanceType: null,

      workingMinutes: 0,

      holidayId: holiday.id ?? null,

      holidayName: holiday.name ?? holiday.title ?? null,

      /*
       * Preserve actual attendance fields
       * if they somehow exist.
       */
      ...(existing?.checkInTime
        ? {
            checkInTime: existing.checkInTime,
          }
        : {}),

      ...(existing?.checkOutTime
        ? {
            checkOutTime: existing.checkOutTime,
          }
        : {}),

      ...(existing?.shiftSnapshot
        ? {
            shiftSnapshot: existing.shiftSnapshot,
          }
        : {}),

      createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private weeklyOffRecord(staff: UserDocument, date: string, shift: ShiftConfig, existing?: any) {
    return {
      staffId: staff.uid,

      rootId: this.getRootId(staff),

      date: this.localDate(date),

      status: 'weekly_off',

      attendanceType: null,

      workingMinutes: 0,

      ...(existing?.checkInTime
        ? {
            checkInTime: existing.checkInTime,
          }
        : {}),

      ...(existing?.checkOutTime
        ? {
            checkOutTime: existing.checkOutTime,
          }
        : {}),

      ...(existing?.shiftSnapshot
        ? {
            shiftSnapshot: existing.shiftSnapshot,
          }
        : {
            shiftSnapshot: shift,
          }),

      createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private absentRecord(staff: UserDocument, date: string, shift?: ShiftConfig, existing?: any) {
    return {
      staffId: staff.uid,

      rootId: this.getRootId(staff),

      date: this.localDate(date),

      status: 'absent',

      attendanceType: null,

      workingMinutes: 0,

      /*
       * Keep the historical shift if
       * attendance already existed.
       */
      ...(existing?.shiftSnapshot
        ? {
            shiftSnapshot: existing.shiftSnapshot,
          }
        : shift
          ? {
              shiftSnapshot: shift,
            }
          : {}),

      createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  // ============================================================
  // FIRESTORE LOADERS
  // ============================================================

  private async loadOrganizationIds(): Promise<string[]> {
    const snapshot = await this.db.collection('user').get();

    const rootIds = new Set<string>();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      const rootId = data.rootId ?? (['root', 'root_manager', 'admin'].includes(data.role ?? '') ? doc.id : undefined);

      if (rootId) {
        rootIds.add(rootId);
      }
    }

    return Array.from(rootIds);
  }

  private async loadAttendanceStaff(rootId: string): Promise<UserDocument[]> {
    const snapshot = await this.db.collection('user').where('rootId', '==', rootId).get();

    return snapshot.docs
      .map((doc) => ({
        uid: doc.id,

        ...(doc.data() as any),
      }))
      .filter((user) => ['field_executive', 'manager', 'hr'].includes(user.role ?? ''));
  }

  private async loadTeams(rootId: string): Promise<Map<string, any>> {
    const snapshot = await this.db.collection('teams').where('rootId', '==', rootId).get();

    const teams = new Map<string, any>();

    for (const doc of snapshot.docs) {
      teams.set(doc.id, {
        id: doc.id,

        ...doc.data(),
      });
    }

    return teams;
  }

  private async loadShifts(rootId: string): Promise<Map<string, ShiftConfig>> {
    const snapshot = await this.db.collection('shifts').where('rootId', '==', rootId).get();

    const shifts = new Map<string, ShiftConfig>();

    for (const doc of snapshot.docs) {
      shifts.set(doc.id, this.mapShift(doc.id, doc.data()));
    }

    return shifts;
  }

  private async loadHoliday(rootId: string, date: string) {
    const snapshot = await this.db.collection('holidays').where('rootId', '==', rootId).get();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (data.isActive === false) {
        continue;
      }

      const startDate = data.startDate ?? data.date;

      const endDate = data.endDate ?? data.date;

      if (this.dateIsBetween(date, startDate, endDate)) {
        return {
          id: doc.id,

          ...data,
        };
      }
    }

    return null;
  }

  private async loadAttendanceRecords(staff: UserDocument[], date: string): Promise<Map<string, any>> {
    const refs = staff.map((member) => this.attendanceRecordRef(member.uid, date));

    const result = new Map<string, any>();

    /*
     * Firestore getAll() has practical request-size
     * considerations, so load in chunks.
     */
    for (let index = 0; index < refs.length; index += AttendanceSchedulerService.STAFF_CHUNK_SIZE) {
      const refChunk = refs.slice(index, index + AttendanceSchedulerService.STAFF_CHUNK_SIZE);

      if (!refChunk.length) {
        continue;
      }

      const snapshots = await this.db.getAll(...refChunk);

      snapshots.forEach((snapshot, offset) => {
        if (snapshot.exists) {
          result.set(staff[index + offset].uid, snapshot.data());
        }
      });
    }

    return result;
  }

  // ============================================================
  // SHIFT RESOLUTION
  // ============================================================

  private resolveShift(
    staff: UserDocument,
    teams: Map<string, any>,
    shifts: Map<string, ShiftConfig>,
    existing?: any
  ): ShiftConfig | undefined {
    /*
     * Historical shift always wins.
     */
    if (existing?.shiftSnapshot) {
      const historical = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (historical) {
        return historical;
      }
    }

    /*
     * Direct shift takes priority.
     *
     * This is required for child managers
     * and HR.
     */
    if (staff.shiftId) {
      const shift = shifts.get(staff.shiftId);

      if (shift) {
        return shift;
      }
    }

    /*
     * Team-based staff:
     *
     * user.teamId
     *      ↓
     * teams.shiftId
     *      ↓
     * shifts
     */
    if (staff.teamId) {
      const team = teams.get(staff.teamId);

      if (team?.shiftId) {
        return shifts.get(team.shiftId);
      }
    }

    return undefined;
  }

  private shiftFromSnapshot(snapshot: any): ShiftConfig | undefined {
    if (!snapshot || typeof snapshot !== 'object') {
      return undefined;
    }

    if (
      snapshot.startHour == null ||
      snapshot.startMinute == null ||
      snapshot.endHour == null ||
      snapshot.endMinute == null
    ) {
      return undefined;
    }

    return this.mapShift(String(snapshot.shiftId ?? snapshot.id ?? 'historical'), snapshot);
  }

  private mapShift(id: string, data: any): ShiftConfig {
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
  // FIRESTORE BATCH WRITES
  // ============================================================

  private async commitOperations(
    operations: Array<{
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.DocumentData;
      type: 'create' | 'update';
    }>
  ) {
    if (!operations.length) {
      return;
    }

    for (let index = 0; index < operations.length; index += AttendanceSchedulerService.WRITE_BATCH_SIZE) {
      const chunk = operations.slice(index, index + AttendanceSchedulerService.WRITE_BATCH_SIZE);

      const batch = this.db.batch();

      for (const operation of chunk) {
        batch.set(operation.ref, operation.data, {
          merge: true,
        });
      }

      await batch.commit();

      this.logger.debug(`Attendance write batch committed | operations=${chunk.length}`);
    }
  }

  // ============================================================
  // WORKING TIME
  // ============================================================

  private calculateWorkingMinutes(checkInValue: any, checkOutValue: any, shift: ShiftConfig): number {
    const checkIn = this.toDate(checkInValue);

    const checkOut = this.toDate(checkOutValue);

    if (!checkIn || !checkOut) {
      return 0;
    }

    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const effectiveCheckIn = checkIn.getTime() < shiftStart.getTime() ? shiftStart : checkIn;

    return Math.max(0, Math.round((checkOut.getTime() - effectiveCheckIn.getTime()) / 60000));
  }

  private calculatePunctuality(checkInValue: any, shift: ShiftConfig): 'on_time' | 'late' {
    const checkIn = this.toDate(checkInValue);

    if (!checkIn) {
      return 'on_time';
    }

    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    return checkIn.getTime() > shiftStart.getTime() + graceMinutes * 60000 ? 'late' : 'on_time';
  }

  // ============================================================
  // WEEKLY OFF
  // ============================================================

  private isWeeklyOff(date: string, shift: ShiftConfig): boolean {
    if (!Array.isArray(shift.weeklyOff)) {
      return false;
    }

    const day = this.localDate(date).getDay();

    /*
     * Support both numeric values
     * and common weekday names.
     */
    return shift.weeklyOff.some((value: any) => {
      if (typeof value === 'number') {
        return value === day;
      }

      const normalized = String(value).toLowerCase();

      const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      return normalized === names[day] || normalized.substring(0, 3) === names[day].substring(0, 3);
    });
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private todayIndia(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceSchedulerService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(new Date());
  }

  private localDate(date: string): Date {
    return new Date(`${date}T00:00:00+05:30`);
  }

  private dateKey(date: string): string {
    return date.replace(/-/g, '');
  }

  private attendanceRecordRef(userId: string, date: string) {
    return this.db.collection('attendance').doc(userId).collection('records').doc(this.dateKey(date));
  }

  private shiftStartForDate(date: Date, shift: ShiftConfig): Date {
    const localDate = this.getIndiaDateParts(date);

    return new Date(
      `${localDate}T${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}:00+05:30`
    );
  }

  private getIndiaDateParts(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceSchedulerService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).format(date);
  }

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

  // ============================================================
  // DATE VALIDATION
  // ============================================================

  private validateProcessingDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid processing date. Expected YYYY-MM-DD.');
    }

    const parsed = new Date(`${date}T00:00:00+05:30`);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Invalid processing date.');
    }

    /*
     * Scheduler should only process completed
     * dates. Today's attendance is still live.
     */
    const today = this.todayIndia();

    if (date >= today) {
      throw new Error(`Attendance can only be processed for completed dates. Requested=${date}, today=${today}`);
    }
  }

  private dateIsBetween(date: string, start: any, end: any): boolean {
    if (!start) {
      return false;
    }

    const target = this.normalizeDate(date);

    const startDate = this.normalizeDate(start);

    const endDate = this.normalizeDate(end ?? start);

    if (!target || !startDate || !endDate) {
      return false;
    }

    return target >= startDate && target <= endDate;
  }

  private normalizeDate(value: any): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value.substring(0, 10);
    }

    const date = this.toDate(value);

    return date ? this.getIndiaDateParts(date) : null;
  }

  // ============================================================
  // ROOT ID
  // ============================================================

  private getRootId(user: any): string | undefined {
    if (['root', 'root_manager', 'admin'].includes(user.role ?? '')) {
      return user.rootId ?? user.uid;
    }

    return user.rootId;
  }

  private async getUser(userId: string): Promise<UserDocument> {
    const doc = await this.db.collection('user').doc(userId).get();

    if (!doc.exists) {
      throw new NotFoundException('User not found');
    }

    return {
      uid: doc.id,
      ...(doc.data() as any),
    };
  }
}
