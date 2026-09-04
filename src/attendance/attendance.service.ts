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

import { AttendanceStatus, ShiftConfig, UserDocument } from './interfaces/attendance-processing.interface';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  private static readonly ATTENDANCE_ROLES = new Set(['field_executive', 'manager', 'hr']);

  private static readonly ROOT_ROLES = new Set(['root', 'admin', 'root_manager']);

  private static readonly CHECKOUT_UNDO_WINDOW_MINUTES = 10;

  private static readonly CHECKOUT_HISTORY_LIMIT = 20;

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

    /*
     * Attendance `date` is stored as a Firestore Timestamp.
     *
     * The boundaries represent midnight in
     * Asia/Kolkata for the requested month.
     *
     * Example:
     * September 2026:
     * start = 1 September 2026 00:00:00 +05:30
     * end   = 1 October 2026 00:00:00 +05:30
     */
    const start = this.localDate(`${dto.year}-${String(dto.month).padStart(2, '0')}-01`);

    const nextMonth = dto.month === 12 ? 1 : dto.month + 1;

    const nextYear = dto.month === 12 ? dto.year + 1 : dto.year;

    const end = this.localDate(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);

    this.logger.log(
      `Attendance date range | staff=${dto.staffId} | start=${start.toISOString()} | end=${end.toISOString()}`
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

      /*
       * Fetch leave requests referenced by attendance.
       *
       * Attendance stores only leaveRequestId.
       */
      const leaveIds = [
        ...new Set(
          records
            .map((record: any) => record.leaveRequestId)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        ),
      ];

      const leaveMap = new Map<string, any>();

      if (leaveIds.length) {
        /*
         * Firestore `in` queries support
         * up to 30 values.
         */
        for (let i = 0; i < leaveIds.length; i += 30) {
          const chunk = leaveIds.slice(i, i + 30);

          const leaveSnapshot = await this.db.collection('leaveRequests').where('__name__', 'in', chunk).get();

          leaveSnapshot.docs.forEach((doc) => {
            leaveMap.set(doc.id, {
              id: doc.id,
              ...doc.data(),
            });
          });
        }
      }

      /*
       * Attach the corresponding leave request.
       */
      const enrichedRecords = records.map((record: any) => {
        if (!record.leaveRequestId) {
          return record;
        }

        const leave = leaveMap.get(record.leaveRequestId);

        if (!leave) {
          return record;
        }

        return {
          ...record,
          leave,
        };
      });

      /*
       * Newest attendance date first.
       */
      enrichedRecords.sort((a, b) => this.recordDateValue(b.date) - this.recordDateValue(a.date));

      return {
        records: enrichedRecords,
        summary: this.getSummary(enrichedRecords),
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
     * Location is compulsory ONLY when
     * tracking is enabled for this user.
     */
    if (user.isTrackingEnable === true) {
      this.validateLocation(dto.lat, dto.lng);
    } else {
      /*
       * If location is supplied while
       * tracking is disabled, validate it.
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
     * Early check-in is allowed.
     *
     * After shift end, check-in is rejected.
     */
    if (now.getTime() >= shiftEnd.getTime()) {
      throw new BadRequestException('Your shift has already ended. Check-in is no longer available.');
    }

    /*
     * Punctuality is based on
     * shift start + grace period.
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
       * Full-day leave cannot
       * be overridden.
       *
       * The LeaveService will now
       * create approved leave attendance.
       */
      if (existing.status === 'leave' && existing.leaveDuration !== 'half_day') {
        throw new BadRequestException('You are on full-day leave today');
      }

      /*
       * Weekly off / holiday cannot
       * be overridden.
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
         * Snapshot the exact shift
         * applicable at check-in.
         */
        shiftSnapshot: shift,

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * Preserve half-day leave
       * metadata if LeaveService
       * has already synchronized it.
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

      /*
       * Save check-in location
       * when supplied.
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

      status: result.status,

      attendanceType: result.attendanceType,

      punctuality: result.punctuality,

      checkInTime: now.toISOString(),

      checkOutTime: null,

      workingMinutes: 0,

      message: result.message,
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

          checkoutUndoUntil: Date;

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

      /*
       * Already checked out.
       */
      if (existing.checkOutTime) {
        const previousCheckout = this.toDate(existing.checkOutTime);

        if (previousCheckout) {
          const undoUntil = new Date(
            previousCheckout.getTime() + AttendanceService.CHECKOUT_UNDO_WINDOW_MINUTES * 60 * 1000
          );

          if (new Date() <= undoUntil) {
            throw new ConflictException(
              `You have already checked out at ${this.formatTimeForMessage(
                previousCheckout
              )}. You can undo the checkout for ${AttendanceService.CHECKOUT_UNDO_WINDOW_MINUTES} minutes.`
            );
          }
        }

        throw new ConflictException(
          'You have already checked out today. Checkout can no longer be changed from the employee app.'
        );
      }

      const checkIn = this.toDate(existing.checkInTime);

      if (!checkIn) {
        throw new InternalServerErrorException('Invalid check-in time');
      }

      /*
       * Checkout MUST use the
       * historical shift snapshot.
       */
      const shift = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (!shift) {
        throw new InternalServerErrorException('Historical shift information is missing from attendance record');
      }

      const checkOut = new Date();

      /*
       * Early check-in does not
       * count toward working minutes.
       */
      const shiftStart = this.shiftStartForDate(checkIn, shift);

      const effectiveCheckIn = checkIn.getTime() < shiftStart.getTime() ? shiftStart : checkIn;

      const workingMinutes = Math.max(0, Math.round((checkOut.getTime() - effectiveCheckIn.getTime()) / 60000));

      /*
       * Central classification.
       */
      const classification = this.classifyWorkingMinutes(workingMinutes, shift);

      const status = classification.status;

      const attendanceType = classification.attendanceType;

      const punctuality = this.isLate(checkIn, shift) ? 'late' : 'on_time';

      const undoUntil = new Date(checkOut.getTime() + AttendanceService.CHECKOUT_UNDO_WINDOW_MINUTES * 60 * 1000);

      /*
       * Audit history.
       */
      const checkoutHistory = Array.isArray(existing.checkoutHistory) ? [...existing.checkoutHistory] : [];

      checkoutHistory.push({
        action: 'checkout',

        performedBy: userId,

        performedByRole: user.role ?? null,

        checkOutTime: Timestamp.fromDate(checkOut),

        workingMinutes,

        status,

        attendanceType,

        recordedAt: Timestamp.fromDate(checkOut),

        undoUntil: Timestamp.fromDate(undoUntil),

        ...(dto.lat != null && dto.lng != null
          ? {
              location: {
                lat: Number(dto.lat),
                lng: Number(dto.lng),
              },
            }
          : {}),
      });

      const limitedHistory = checkoutHistory.slice(-AttendanceService.CHECKOUT_HISTORY_LIMIT);

      const update: FirebaseFirestore.DocumentData = {
        checkOutTime: FieldValue.serverTimestamp(),

        workingMinutes,

        status,

        attendanceType,

        punctuality,

        checkoutUndoUntil: Timestamp.fromDate(undoUntil),

        checkoutCount: Number(existing.checkoutCount ?? 0) + 1,

        lastCheckoutAt: FieldValue.serverTimestamp(),

        checkoutHistory: limitedHistory,

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

        if (existing.leaveRequestId) {
          update.leaveRequestId = existing.leaveRequestId;
        }

        if (existing.leaveStatus) {
          update.leaveStatus = existing.leaveStatus;
        }
      }

      /*
       * Checkout location.
       */
      if (dto.lat != null && dto.lng != null) {
        update.checkOutLocation = {
          lat: Number(dto.lat),
          lng: Number(dto.lng),
        };
      }

      /*
       * Never replace historical
       * shift snapshot.
       */
      if (!existing.shiftSnapshot) {
        update.shiftSnapshot = shift;
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

        checkoutUndoUntil: undoUntil,

        message: 'Check-out recorded successfully. You can undo this checkout for 10 minutes.',
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

      checkoutUndoUntil: result.checkoutUndoUntil.toISOString(),

      canUndoCheckout: true,

      message: result.message,
    };
  }

  // ============================================================
  // UNDO CHECK OUT
  // ============================================================

  async undoCheckout(userId: string) {
    const user = await this.getUser(userId);

    this.assertAttendanceStaff(user);

    const rootId = this.getRootId(user);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    const date = this.todayIndia();

    const recordId = this.dateKey(date);

    const ref = this.attendanceRecordRef(userId, date);

    let result:
      | {
          checkInTime: Date;

          punctuality: 'on_time' | 'late';

          message: string;
        }
      | undefined;

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        throw new NotFoundException('No attendance record found for today');
      }

      const existing = snapshot.data() ?? {};

      if (!existing.checkInTime) {
        throw new BadRequestException('You have not checked in today');
      }

      if (!existing.checkOutTime) {
        throw new ConflictException('You are already working. There is no checkout to undo.');
      }

      const checkOut = this.toDate(existing.checkOutTime);

      if (!checkOut) {
        throw new InternalServerErrorException('Invalid checkout time');
      }

      const undoUntil =
        this.toDate(existing.checkoutUndoUntil) ??
        new Date(checkOut.getTime() + AttendanceService.CHECKOUT_UNDO_WINDOW_MINUTES * 60 * 1000);

      const now = new Date();

      if (now.getTime() > undoUntil.getTime()) {
        throw new ForbiddenException('The checkout correction window has expired. Please contact your manager or HR.');
      }

      const shift = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (!shift) {
        throw new InternalServerErrorException('Historical shift information is missing from attendance record');
      }

      const checkIn = this.toDate(existing.checkInTime);

      if (!checkIn) {
        throw new InternalServerErrorException('Invalid check-in time');
      }

      /*
       * Audit.
       */
      const checkoutHistory = Array.isArray(existing.checkoutHistory) ? [...existing.checkoutHistory] : [];

      checkoutHistory.push({
        action: 'checkout_cancelled',

        performedBy: userId,

        performedByRole: user.role ?? null,

        cancelledCheckoutAt: Timestamp.fromDate(checkOut),

        recordedAt: Timestamp.fromDate(now),

        reason: 'employee_undo',
      });

      const limitedHistory = checkoutHistory.slice(-AttendanceService.CHECKOUT_HISTORY_LIMIT);

      /*
       * Restore working state.
       */
      const update: FirebaseFirestore.DocumentData = {
        checkOutTime: FieldValue.delete(),

        checkoutUndoUntil: FieldValue.delete(),

        lastCheckoutAt: FieldValue.delete(),

        checkoutCount: Math.max(0, Number(existing.checkoutCount ?? 1) - 1),

        status: 'present',

        attendanceType: FieldValue.delete(),

        workingMinutes: 0,

        punctuality: this.isLate(checkIn, shift) ? 'late' : 'on_time',

        checkoutHistory: limitedHistory,

        checkOutLocation: FieldValue.delete(),

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * Restore half-day leave metadata.
       */
      if (existing.leaveDuration === 'half_day') {
        update.leaveDuration = 'half_day';

        if (existing.leaveTypeId) {
          update.leaveTypeId = existing.leaveTypeId;
        }

        if (existing.leaveRequestId) {
          update.leaveRequestId = existing.leaveRequestId;
        }

        if (existing.leaveStatus) {
          update.leaveStatus = existing.leaveStatus;
        }
      }

      transaction.set(ref, update, {
        merge: true,
      });

      result = {
        checkInTime: checkIn,

        punctuality: this.isLate(checkIn, shift) ? 'late' : 'on_time',

        message: 'Checkout cancelled successfully. You are working again.',
      };
    });

    if (!result) {
      throw new InternalServerErrorException('Unable to undo checkout');
    }

    return {
      id: recordId,

      staffId: userId,

      date,

      status: 'present',

      attendanceType: 'full_day',

      punctuality: result.punctuality,

      checkInTime: result.checkInTime.toISOString(),

      checkOutTime: null,

      workingMinutes: 0,

      canUndoCheckout: false,

      message: result.message,
    };
  }

  // ============================================================
  // MANAGER / HR CHECKOUT CORRECTION
  // ============================================================

  async correctCheckout(
    requesterId: string,
    staffId: string,
    dto: {
      checkOutTime: string;
      reason: string;
    }
  ) {
    const requester = await this.getUser(requesterId);

    if (!['manager', 'hr', 'root', 'root_manager', 'admin'].includes(requester.role ?? '')) {
      throw new ForbiddenException('You are not authorized to correct attendance');
    }

    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('A correction reason is required');
    }

    const checkoutDate = new Date(dto.checkOutTime);

    if (Number.isNaN(checkoutDate.getTime())) {
      throw new BadRequestException('Invalid checkout time');
    }

    const staff = await this.getUser(staffId);

    const requesterRoot = this.getRootId(requester);

    const staffRoot = this.getRootId(staff);

    if (!requesterRoot || !staffRoot || requesterRoot !== staffRoot) {
      throw new ForbiddenException('You are not authorized to modify this attendance');
    }

    /*
     * ----------------------------------------------------------
     * MANAGER AUTHORIZATION
     * ----------------------------------------------------------
     */
    if (requester.role === 'manager') {
      const users = await this.loadRootUsers(requesterRoot);

      const descendants = this.getDescendantIds(requester.uid, users);

      if (staff.uid !== requester.uid && !descendants.has(staff.uid)) {
        throw new ForbiddenException('You are not authorized to correct this staff attendance');
      }
    }

    /*
     * ----------------------------------------------------------
     * HR AUTHORIZATION
     * ----------------------------------------------------------
     */
    if (requester.role === 'hr') {
      const authorizedIds = this.getHrAuthorizedStaffIds(requester);

      if (staff.uid !== requester.uid && !authorizedIds.has(staff.uid)) {
        throw new ForbiddenException('You are not authorized to correct this staff attendance');
      }
    }

    /*
     * Correction is based on
     * the India local date.
     */
    const date = this.getIndiaDateParts(checkoutDate);

    const ref = this.attendanceRecordRef(staffId, date);

    let result:
      | {
          status: AttendanceStatus;

          attendanceType: 'full_day' | 'half_day' | null;

          workingMinutes: number;
        }
      | undefined;

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        throw new NotFoundException('Attendance record not found');
      }

      const existing = snapshot.data() ?? {};

      if (!existing.checkInTime) {
        throw new BadRequestException('Employee has not checked in');
      }

      const checkIn = this.toDate(existing.checkInTime);

      if (!checkIn) {
        throw new InternalServerErrorException('Invalid check-in time');
      }

      /*
       * Historical shift is
       * authoritative.
       */
      const shift = this.shiftFromSnapshot(existing.shiftSnapshot);

      if (!shift) {
        throw new InternalServerErrorException('Historical shift information is missing from attendance record');
      }

      /*
       * Do not allow checkout
       * before check-in.
       */
      if (checkoutDate.getTime() <= checkIn.getTime()) {
        throw new BadRequestException('Checkout time must be after check-in time');
      }

      /*
       * Early check-in does not
       * count toward working minutes.
       */
      const shiftStart = this.shiftStartForDate(checkIn, shift);

      const effectiveCheckIn = checkIn.getTime() < shiftStart.getTime() ? shiftStart : checkIn;

      const workingMinutes = Math.max(0, Math.round((checkoutDate.getTime() - effectiveCheckIn.getTime()) / 60000));

      const classification = this.classifyWorkingMinutes(workingMinutes, shift);

      const punctuality = this.isLate(checkIn, shift) ? 'late' : 'on_time';

      /*
       * Audit history.
       */
      const checkoutHistory = Array.isArray(existing.checkoutHistory) ? [...existing.checkoutHistory] : [];

      checkoutHistory.push({
        action: 'manager_hr_correction',

        performedBy: requester.uid,

        performedByRole: requester.role ?? null,

        previousCheckOutTime: existing.checkOutTime ? this.toDate(existing.checkOutTime) : null,

        newCheckOutTime: Timestamp.fromDate(checkoutDate),

        workingMinutes,

        status: classification.status,

        attendanceType: classification.attendanceType,

        reason: dto.reason.trim(),

        recordedAt: Timestamp.fromDate(new Date()),
      });

      const limitedHistory = checkoutHistory.slice(-AttendanceService.CHECKOUT_HISTORY_LIMIT);

      const update: FirebaseFirestore.DocumentData = {
        checkOutTime: Timestamp.fromDate(checkoutDate),

        workingMinutes,

        status: classification.status,

        punctuality,

        checkoutHistory: limitedHistory,

        /*
         * Employee undo is no
         * longer available.
         */
        checkoutUndoUntil: FieldValue.delete(),

        updatedAt: FieldValue.serverTimestamp(),
      };

      if (classification.attendanceType) {
        update.attendanceType = classification.attendanceType;
      } else {
        update.attendanceType = FieldValue.delete();
      }

      /*
       * Preserve half-day leave
       * metadata.
       */
      if (existing.leaveDuration === 'half_day') {
        update.leaveDuration = 'half_day';

        if (existing.leaveTypeId) {
          update.leaveTypeId = existing.leaveTypeId;
        }

        if (existing.leaveRequestId) {
          update.leaveRequestId = existing.leaveRequestId;
        }

        if (existing.leaveStatus) {
          update.leaveStatus = existing.leaveStatus;
        }
      }

      transaction.set(ref, update, {
        merge: true,
      });

      result = {
        status: classification.status,

        attendanceType: classification.attendanceType,

        workingMinutes,
      };
    });

    if (!result) {
      throw new InternalServerErrorException('Unable to correct checkout');
    }

    return {
      staffId,

      date,

      status: result.status,

      attendanceType: result.attendanceType,

      workingMinutes: result.workingMinutes,

      correctedBy: requester.uid,

      correctedByRole: requester.role,

      message: 'Attendance checkout corrected successfully.',
    };
  }

  // ============================================================
  // ATTENDANCE CLASSIFICATION
  // ============================================================

  /*
   * This method is intentionally kept in
   * AttendanceService because both normal
   * checkout and manager/HR correction use it.
   *
   * SchedulerService can also call this
   * later if we expose it appropriately.
   */
  classifyWorkingMinutes(
    workingMinutes: number,
    shift: ShiftConfig
  ): {
    status: AttendanceStatus;

    attendanceType: 'full_day' | 'half_day' | null;
  } {
    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    /*
     * Existing TeamoTrack rule:
     *
     * fullDayMinutes = 480
     * graceMinutes   = 15
     *
     * Full-day threshold = 465
     *
     * halfDayMinutes = 240
     *
     * Half-day threshold = 225
     *
     * This preserves the current
     * implementation's classification
     * behavior.
     */
    const fullDayThreshold = Math.max(0, Number(shift.fullDayMinutes ?? 480)) - graceMinutes;

    const halfDayThreshold = Math.max(0, Number(shift.halfDayMinutes ?? 240)) - graceMinutes;

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
  // SHIFT RESOLUTION FOR LIVE ATTENDANCE
  // ============================================================

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
     * Field executive:
     *
     * user.teamId ->
     * teams.shiftId ->
     * shifts
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
  // HISTORICAL SHIFT
  // ============================================================

  private shiftFromSnapshot(snapshot: any): ShiftConfig | undefined {
    if (!snapshot || typeof snapshot !== 'object') {
      return undefined;
    }

    /*
     * Zero is valid for midnight.
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
     * Field executive.
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
        const id = child.uid ?? child.id;

        if (!id || ids.has(id)) {
          continue;
        }

        ids.add(id);

        /*
         * Only managers continue
         * recursively.
         *
         * HR does not create
         * another hierarchy.
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
    /*
     * Top-level organization users
     * can use their own UID as rootId.
     */
    if (user.role === 'root' || user.role === 'root_manager' || user.role === 'admin') {
      return user.rootId ?? user.uid;
    }

    return user.rootId;
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
     * Overnight shift.
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

  private isLate(checkIn: Date, shift: ShiftConfig): boolean {
    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    /*
     * Exactly at shift start +
     * grace is still on time.
     *
     * Late starts only after grace.
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

      /*
       * Leave information is now
       * stored directly on attendance.
       */
      ...(data.leaveRequestId
        ? {
            leaveRequestId: data.leaveRequestId,
          }
        : {}),

      ...(data.leaveStatus
        ? {
            leaveStatus: data.leaveStatus,
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

      ...(data.checkoutUndoUntil
        ? {
            checkoutUndoUntil: data.checkoutUndoUntil,
          }
        : {}),

      ...(data.checkoutCount != null
        ? {
            checkoutCount: Number(data.checkoutCount),
          }
        : {}),

      ...(Array.isArray(data.checkoutHistory)
        ? {
            checkoutHistory: data.checkoutHistory,
          }
        : {}),
    };
  }

  private getSummary(records: any[]) {
    return {
      totalPresent: records.filter((x) => x.status === 'present').length,

      totalLate: records.filter((x) => x.punctuality === 'late').length,

      totalOnTime: records.filter((x) => x.punctuality === 'on_time').length,

      totalHalfDay: records.filter((x) => x.attendanceType === 'half_day' || x.status === 'half_day').length,

      totalFullDay: records.filter((x) => x.attendanceType === 'full_day').length,

      totalWeeklyOff: records.filter((x) => x.status === 'weekly_off').length,

      totalHoliday: records.filter((x) => x.status === 'holiday').length,

      totalLeave: records.filter((x) => x.status === 'leave').length,

      totalAbsent: records.filter((x) => x.status === 'absent').length,

      totalWorkingMinutes: records.reduce((sum, x) => sum + (Number(x.workingMinutes) || 0), 0),
    };
  }

  // ============================================================
  // MESSAGE FORMAT
  // ============================================================

  private formatTimeForMessage(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',

      minute: '2-digit',

      hour12: true,

      timeZone: AttendanceService.TIME_ZONE,
    }).format(date);
  }
}
