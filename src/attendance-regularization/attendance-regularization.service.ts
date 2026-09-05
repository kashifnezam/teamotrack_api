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

import {
  AttendanceRegularizationType,
  CreateAttendanceRegularizationDto,
} from './dto/create-attendance-regularization.dto';

@Injectable()
export class AttendanceRegularizationService {
  private readonly logger = new Logger(AttendanceRegularizationService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  private static readonly STAFF_ROLES = new Set(['field_executive', 'manager', 'hr']);

  private static readonly ROOT_ROLES = new Set(['root', 'admin', 'root_manager']);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ============================================================
  // CREATE REGULARIZATION
  // ============================================================

  async create(requesterId: string, dto: CreateAttendanceRegularizationDto) {
    const requester = await this.getUser(requesterId);

    this.assertCanRaise(requester);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * Root does not use the normal
     * parent-manager approval flow.
     */
    if (this.isRoot(requester)) {
      throw new BadRequestException('Root manager attendance does not use regularization approval');
    }

    /*
     * HR / Manager / Executive must
     * have a parent manager.
     */
    if (!requester.parentId) {
      throw new BadRequestException('No parent manager is assigned to this account');
    }

    /*
     * Validate attendance date.
     */
    const date = this.normalizeDate(dto.date);

    this.assertNotFutureDate(date);

    /*
     * Validate requested times.
     */
    const checkInTime = dto.checkInTime ? this.parseDate(dto.checkInTime) : null;

    const checkOutTime = dto.checkOutTime ? this.parseDate(dto.checkOutTime) : null;

    this.validateRequestedTimes(dto.type, date, checkInTime, checkOutTime);

    /*
     * Make sure parent manager exists
     * and belongs to the same organization.
     */
    const parent = await this.getUser(requester.parentId);

    if (this.getRootId(parent) !== rootId) {
      throw new ForbiddenException('Invalid parent manager hierarchy');
    }

    /*
     * Attendance record.
     */
    const attendanceRef = this.attendanceRecordRef(requester.uid, date);

    const attendanceSnapshot = await attendanceRef.get();

    const existingAttendance = attendanceSnapshot.exists ? (attendanceSnapshot.data() ?? {}) : null;

    /*
     * Do not create duplicate
     * pending requests.
     */
    const duplicateSnapshot = await this.db
      .collection('attendanceRegularizations')
      .where('rootId', '==', rootId)
      .where('userId', '==', requester.uid)
      .where('date', '==', date)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!duplicateSnapshot.empty) {
      throw new ConflictException('A pending attendance regularization already exists for this date');
    }

    /*
     * Snapshot the current attendance
     * BEFORE any modification.
     *
     * This is important for audit/history.
     */
    const previousAttendance = existingAttendance ? this.serializeForHistory(existingAttendance) : null;

    /*
     * Approval owner is always
     * the employee's direct parent.
     */
    const approval = [
      {
        level: 0,

        userId: parent.uid,

        status: 'pending',

        createdAt: Timestamp.fromDate(new Date()),
      },
    ];

    const ref = this.db.collection('attendanceRegularizations').doc();

    const now = new Date();

    const data = {
      rootId,

      userId: requester.uid,

      userName: requester.fullName ?? '',

      userRole: requester.role ?? '',

      parentId: parent.uid,

      parentName: parent.fullName ?? '',

      date,

      type: dto.type,

      requestedCheckInTime: checkInTime ? Timestamp.fromDate(checkInTime) : null,

      requestedCheckOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : null,

      reason: dto.reason.trim(),

      attachmentUrl: dto.attachmentUrl?.trim() || null,

      /*
       * Exact attendance state at
       * request creation time.
       */
      previousAttendance,

      /*
       * Approval workflow.
       */
      approval,

      currentLevel: 0,

      status: 'pending',

      createdAt: Timestamp.fromDate(now),

      updatedAt: Timestamp.fromDate(now),
    };

    await ref.set(data);

    this.logger.log(
      `Attendance regularization created | id=${ref.id} | user=${requester.uid} | parent=${parent.uid} | date=${date}`
    );

    return {
      success: true,

      id: ref.id,

      status: 'pending',

      date,

      type: dto.type,

      approver: {
        id: parent.uid,

        name: parent.fullName ?? '',
      },

      message: 'Attendance regularization request submitted successfully.',
    };
  }

  // ============================================================
  // MY REQUESTS
  // ============================================================

  async getMyRequests(userId: string, month?: number, year?: number) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    let query = this.db
      .collection('attendanceRegularizations')
      .where('rootId', '==', rootId)
      .where('userId', '==', userId);

    if (month != null || year != null) {
      if (month == null || year == null) {
        throw new BadRequestException('Both month and year are required');
      }

      this.validateMonthYear(month, year);

      const start = `${year}-${String(month).padStart(2, '0')}-01`;

      const nextMonth = month === 12 ? 1 : month + 1;

      const nextYear = month === 12 ? year + 1 : year;

      const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      query = query.where('date', '>=', start).where('date', '<', end);
    }

    const snapshot = await query.get();

    const requests = snapshot.docs
      .map((doc) => ({
        id: doc.id,

        ...doc.data(),
      }))
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));

    return {
      requests,
    };
  }

  // ============================================================
  // APPROVALS
  // ============================================================

  async getApprovals(userId: string) {
    const requester = await this.getUser(userId);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * Verify approval permission.
     */
    if (!this.isRoot(requester)) {
      const permissions = await this.getPermissions(requester.uid);

      if (requester.role === 'hr') {
        /*
         * HR can have either:
         *
         * attendance.regularization.approve
         * OR
         * attendance.regularization.approve.all
         */
        const canApprove =
          permissions['attendance.regularization.approve'] === true ||
          permissions['attendance.regularization.approve.all'] === true;

        if (!canApprove) {
          return {
            requests: [],
          };
        }
      } else {
        if (permissions['attendance.regularization.approve'] !== true) {
          return {
            requests: [],
          };
        }
      }
    }

    const snapshot = await this.db
      .collection('attendanceRegularizations')
      .where('rootId', '==', rootId)
      .where('status', '==', 'pending')
      .get();

    const requests = snapshot.docs
      .map((doc) => ({
        id: doc.id,

        ...doc.data(),
      }))
      .filter((request: any) => {
        const level = Number(request.currentLevel ?? 0);

        const step = request.approval?.find((item: any) => Number(item.level) === level);

        return this.isApprover(requester, step);
      })
      .sort((a: any, b: any) => this.timestampValue(b.createdAt) - this.timestampValue(a.createdAt));

    return {
      requests,
    };
  }

  // ============================================================
  // DETAIL
  // ============================================================

  async getById(requesterId: string, id: string) {
    const requester = await this.getUser(requesterId);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = snapshot.data() ?? {};

    if (data.rootId !== this.getRootId(requester)) {
      throw new NotFoundException('Attendance regularization not found');
    }

    /*
     * Request owner can see
     * their own request.
     */
    if (data.userId === requester.uid) {
      return {
        id,

        ...data,
      };
    }

    /*
     * Check approval access.
     */
    await this.assertApprovalAccess(requester, data);

    return {
      id,

      ...data,
    };
  }

  // ============================================================
  // APPROVE
  // ============================================================

  async approve(userId: string, id: string) {
    const approver = await this.getUser(userId);

    const rootId = this.getRootId(approver);

    /*
     * Permission.
     */
    await this.assertCanApprove(approver);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = doc.data()!;

    if (data.status !== 'pending') {
      throw new BadRequestException('Attendance regularization is not pending');
    }

    /*
     * Never self approve.
     */
    if (data.userId === approver.uid) {
      throw new BadRequestException('You cannot approve your own attendance regularization');
    }

    const level = Number(data.currentLevel ?? 0);

    const steps = Array.isArray(data.approval) ? data.approval : [];

    const step = steps.find((item: any) => Number(item.level) === level);

    /*
     * Direct manager OR
     * HR acting on behalf of
     * direct parent manager.
     */
    if (!this.isApprover(approver, step)) {
      throw new ForbiddenException('You are not authorized to approve this attendance regularization');
    }

    /*
     * We have only one approval
     * level currently.
     *
     * Keep this structure so it can
     * become multi-level later.
     */
    step.status = 'approved';

    step.approvedBy = approver.uid;

    step.approvedByRole = approver.role ?? null;

    step.approvedAt = Timestamp.fromDate(new Date());

    /*
     * Persist approval first.
     *
     * The attendance update is performed
     * after authorization and validation.
     */
    await this.applyApprovedRegularization(id, data, approver);

    await ref.update({
      approval: steps,

      currentLevel: null,

      status: 'approved',

      approvedBy: approver.uid,

      approvedByRole: approver.role ?? null,

      approvedAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    this.logger.log(
      `Attendance regularization approved | id=${id} | actualApprover=${approver.uid} | role=${approver.role}`
    );

    return {
      success: true,

      id,

      status: 'approved',

      approvedBy: approver.uid,

      message: 'Attendance regularization approved successfully.',
    };
  }

  // ============================================================
  // REJECT
  // ============================================================

  async reject(userId: string, id: string, reason?: string) {
    const approver = await this.getUser(userId);

    const rootId = this.getRootId(approver);

    await this.assertCanApprove(approver);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = doc.data()!;

    if (data.status !== 'pending') {
      throw new BadRequestException('Attendance regularization is not pending');
    }

    /*
     * Never self reject.
     */
    if (data.userId === approver.uid) {
      throw new BadRequestException('You cannot reject your own attendance regularization');
    }

    const level = Number(data.currentLevel ?? 0);

    const step = data.approval?.find((item: any) => Number(item.level) === level);

    if (!this.isApprover(approver, step)) {
      throw new ForbiddenException('You are not authorized to reject this attendance regularization');
    }

    if (reason != null && reason.trim().length < 3) {
      throw new BadRequestException('Rejection reason must contain at least 3 characters');
    }

    step.status = 'rejected';

    step.rejectedBy = approver.uid;

    step.rejectedByRole = approver.role ?? null;

    step.rejectedAt = Timestamp.fromDate(new Date());

    await ref.update({
      approval: data.approval,

      currentLevel: null,

      status: 'rejected',

      rejectionReason: reason?.trim() ?? '',

      rejectedBy: approver.uid,

      rejectedByRole: approver.role ?? null,

      rejectedAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    this.logger.log(
      `Attendance regularization rejected | id=${id} | actualApprover=${approver.uid} | role=${approver.role}`
    );

    return {
      success: true,

      id,

      status: 'rejected',

      rejectedBy: approver.uid,

      message: 'Attendance regularization rejected.',
    };
  }

  // ============================================================
  // CANCEL
  // ============================================================

  async cancel(userId: string, id: string) {
    const requester = await this.getUser(userId);

    const rootId = this.getRootId(requester);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = doc.data()!;

    if (data.userId !== requester.uid) {
      throw new ForbiddenException('You can only cancel your own regularization requests');
    }

    if (data.status !== 'pending') {
      throw new BadRequestException('Only pending regularization requests can be cancelled');
    }

    await ref.update({
      status: 'cancelled',

      currentLevel: null,

      cancelledBy: requester.uid,

      cancelledAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    this.logger.log(`Attendance regularization cancelled | id=${id} | user=${requester.uid}`);

    return {
      success: true,

      id,

      status: 'cancelled',

      message: 'Attendance regularization cancelled.',
    };
  }

  // ============================================================
  // APPLY APPROVED REGULARIZATION
  // ============================================================

  private async applyApprovedRegularization(regularizationId: string, data: any, approver: any) {
    const attendanceRef = this.attendanceRecordRef(data.userId, data.date);

    /*
     * Use a transaction because the
     * attendance record could have
     * changed after the employee
     * submitted the request.
     */
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attendanceRef);

      const current = snapshot.exists ? (snapshot.data() ?? {}) : {};

      /*
       * ------------------------------------------------------
       * CONFLICT CHECK
       * ------------------------------------------------------
       *
       * If attendance has changed after
       * the request was submitted, don't
       * silently destroy the new state.
       */
      const original = data.previousAttendance;

      if (original && !this.attendanceStateMatches(current, original)) {
        throw new ConflictException(
          'Attendance has changed since this regularization request was submitted. Please review the current attendance before applying the correction.'
        );
      }

      /*
       * Historical shift is mandatory
       * whenever an attendance record
       * already exists.
       */
      let shift = this.shiftFromSnapshot(current.shiftSnapshot);

      /*
       * If the attendance record does
       * not exist, we cannot calculate
       * attendance without historical
       * shift information.
       */
      if (!shift) {
        throw new BadRequestException('Historical shift information is missing from attendance record');
      }

      /*
       * Existing timestamps.
       */
      const existingCheckIn = this.toDate(current.checkInTime);

      const existingCheckOut = this.toDate(current.checkOutTime);

      /*
       * Requested timestamps.
       */
      const requestedCheckIn = data.requestedCheckInTime ? this.toDate(data.requestedCheckInTime) : null;

      const requestedCheckOut = data.requestedCheckOutTime ? this.toDate(data.requestedCheckOutTime) : null;

      /*
       * Determine final values.
       *
       * A missing value means:
       * preserve the existing value.
       */
      const finalCheckIn = requestedCheckIn ?? existingCheckIn;

      const finalCheckOut = requestedCheckOut ?? existingCheckOut;

      /*
       * ------------------------------------------------------
       * MISSED BOTH / MISSING RECORD
       * ------------------------------------------------------
       */
      if (!finalCheckIn && !finalCheckOut) {
        throw new BadRequestException('At least one valid check-in or check-out time is required');
      }

      /*
       * Checkout cannot exist
       * without check-in.
       */
      if (finalCheckOut && !finalCheckIn) {
        throw new BadRequestException('Check-in time is required when correcting check-out');
      }

      /*
       * Checkout must be after
       * check-in.
       */
      if (finalCheckIn && finalCheckOut && finalCheckOut.getTime() <= finalCheckIn.getTime()) {
        throw new BadRequestException('Checkout time must be after check-in time');
      }

      /*
       * ------------------------------------------------------
       * WORKING MINUTES
       * ------------------------------------------------------
       */
      let workingMinutes = 0;

      let status: 'present' | 'absent' | 'half_day' = 'absent';

      let attendanceType: 'full_day' | 'half_day' | null = null;

      let punctuality: 'on_time' | 'late' | null = null;

      if (finalCheckIn) {
        punctuality = this.isLate(finalCheckIn, shift);
      }

      /*
       * Complete attendance.
       */
      if (finalCheckIn && finalCheckOut) {
        const shiftStart = this.shiftStartForDate(finalCheckIn, shift);

        /*
         * Early check-in does not
         * count toward working minutes.
         */
        const effectiveCheckIn = finalCheckIn.getTime() < shiftStart.getTime() ? shiftStart : finalCheckIn;

        workingMinutes = Math.max(0, Math.round((finalCheckOut.getTime() - effectiveCheckIn.getTime()) / 60000));

        const classification = this.classifyWorkingMinutes(workingMinutes, shift);

        status = classification.status;

        attendanceType = classification.attendanceType;
      } else {
        /*
         * Check-in exists but checkout
         * is still missing.
         *
         * Keep the record as present
         * with zero calculated minutes,
         * exactly like the employee
         * check-in flow.
         */
        status = 'present';

        attendanceType = 'full_day';

        workingMinutes = 0;
      }

      /*
       * ------------------------------------------------------
       * PRESERVE ALL PREVIOUS STATE
       * ------------------------------------------------------
       */
      const regularizationHistory = Array.isArray(current.regularizationHistory)
        ? [...current.regularizationHistory]
        : [];

      regularizationHistory.push({
        action: 'REGULARIZATION_APPLIED',

        regularizationId,

        requestedBy: data.userId,

        requestedByRole: data.userRole ?? null,

        approvedBy: approver.uid,

        approvedByRole: approver.role ?? null,

        approvedAt: Timestamp.fromDate(new Date()),

        reason: data.reason ?? '',

        type: data.type ?? null,

        previous: this.serializeForHistory(current),

        requested: {
          checkInTime: data.requestedCheckInTime ?? null,

          checkOutTime: data.requestedCheckOutTime ?? null,
        },

        resulting: {
          checkInTime: finalCheckIn ? Timestamp.fromDate(finalCheckIn) : null,

          checkOutTime: finalCheckOut ? Timestamp.fromDate(finalCheckOut) : null,

          workingMinutes,

          status,

          attendanceType,

          punctuality,
        },

        recordedAt: Timestamp.fromDate(new Date()),
      });

      /*
       * Keep a reasonable amount of
       * history on the attendance record.
       */
      const limitedHistory = regularizationHistory.slice(-20);

      /*
       * ------------------------------------------------------
       * ATTENDANCE UPDATE
       * ------------------------------------------------------
       */
      const update: FirebaseFirestore.DocumentData = {
        staffId: data.userId,

        rootId: data.rootId,

        date: current.date ?? this.localDate(data.date),

        workingMinutes,

        status,

        attendanceType,

        regularizationId,

        regularized: true,

        regularizedBy: approver.uid,

        regularizedByRole: approver.role ?? null,

        regularizedAt: FieldValue.serverTimestamp(),

        regularizationReason: data.reason ?? '',

        regularizationHistory: limitedHistory,

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * Check-in.
       */
      if (finalCheckIn) {
        update.checkInTime = Timestamp.fromDate(finalCheckIn);
      } else {
        update.checkInTime = FieldValue.delete();
      }

      /*
       * Check-out.
       */
      if (finalCheckOut) {
        update.checkOutTime = Timestamp.fromDate(finalCheckOut);
      } else {
        update.checkOutTime = FieldValue.delete();
      }

      /*
       * Recalculate punctuality.
       */
      if (punctuality) {
        update.punctuality = punctuality;
      } else {
        update.punctuality = FieldValue.delete();
      }

      /*
       * Employee undo checkout
       * must not remain available
       * after a manager/HR
       * regularization.
       */
      update.checkoutUndoUntil = FieldValue.delete();

      update.lastCheckoutAt = finalCheckOut ? Timestamp.fromDate(finalCheckOut) : FieldValue.delete();

      /*
       * Preserve existing leave metadata.
       *
       * Regularization must not
       * destroy leave information.
       */
      if (current.leaveRequestId) {
        update.leaveRequestId = current.leaveRequestId;
      }

      if (current.leaveTypeId) {
        update.leaveTypeId = current.leaveTypeId;
      }

      if (current.leaveDuration) {
        update.leaveDuration = current.leaveDuration;
      }

      if (current.leaveStatus) {
        update.leaveStatus = current.leaveStatus;
      }

      /*
       * Never replace historical
       * shift snapshot.
       */
      if (current.shiftSnapshot) {
        update.shiftSnapshot = current.shiftSnapshot;
      }

      transaction.set(attendanceRef, update, {
        merge: true,
      });
    });

    this.logger.log(
      `Attendance regularization applied | regularization=${regularizationId} | staff=${data.userId} | approver=${approver.uid}`
    );
  }

  // ============================================================
  // APPROVAL AUTHORIZATION
  // ============================================================

  private async assertCanApprove(user: any) {
    if (this.isRoot(user)) {
      return;
    }

    if (!['manager', 'hr'].includes(user.role ?? '')) {
      throw new ForbiddenException('You are not authorized to approve attendance regularization');
    }

    const permissions = await this.getPermissions(user.uid);

    if (user.role === 'hr') {
      const allowed =
        permissions['attendance.regularization.approve'] === true ||
        permissions['attendance.regularization.approve.all'] === true;

      if (!allowed) {
        throw new ForbiddenException('Permission denied');
      }

      return;
    }

    if (permissions['attendance.regularization.approve'] !== true) {
      throw new ForbiddenException('Permission denied');
    }
  }

  private async assertApprovalAccess(user: any, data: any) {
    if (this.isRoot(user)) {
      return;
    }

    const level = Number(data.currentLevel ?? 0);

    const step = data.approval?.find((item: any) => Number(item.level) === level);

    if (this.isApprover(user, step)) {
      return;
    }

    throw new ForbiddenException('You are not authorized to view this approval');
  }

  private isApprover(user: any, step: any): boolean {
    if (!step || step.status !== 'pending') {
      return false;
    }

    /*
     * Direct parent manager.
     */
    if (step.userId === user.uid) {
      return true;
    }

    /*
     * HR delegation.
     *
     * HR acts on behalf of
     * its parent manager.
     */
    if (user.role === 'hr' && user.parentId && user.parentId === step.userId) {
      return true;
    }

    return false;
  }

  // ============================================================
  // REQUEST VALIDATION
  // ============================================================

  private validateRequestedTimes(
    type: AttendanceRegularizationType,
    date: string,
    checkIn: Date | null,
    checkOut: Date | null
  ) {
    const requiresCheckIn = [
      AttendanceRegularizationType.MISSED_CHECK_IN,
      AttendanceRegularizationType.WRONG_CHECK_IN,
      AttendanceRegularizationType.MISSED_BOTH,
      AttendanceRegularizationType.WRONG_BOTH,
    ].includes(type);

    const requiresCheckOut = [
      AttendanceRegularizationType.MISSED_CHECK_OUT,
      AttendanceRegularizationType.WRONG_CHECK_OUT,
      AttendanceRegularizationType.MISSED_BOTH,
      AttendanceRegularizationType.WRONG_BOTH,
    ].includes(type);

    if (requiresCheckIn && !checkIn) {
      throw new BadRequestException('Check-in time is required for this regularization type');
    }

    if (requiresCheckOut && !checkOut) {
      throw new BadRequestException('Check-out time is required for this regularization type');
    }

    /*
     * SYSTEM_ERROR / LOCATION_ERROR /
     * OTHER can still correct one
     * or both times.
     */
    if (checkIn && checkOut && checkOut.getTime() <= checkIn.getTime()) {
      throw new BadRequestException('Check-out time must be after check-in time');
    }

    /*
     * Requested timestamps must belong
     * to the selected attendance date
     * in India.
     */
    if (checkIn && this.getIndiaDateParts(checkIn) !== date) {
      throw new BadRequestException('Check-in time must belong to the selected attendance date');
    }

    if (checkOut && this.getIndiaDateParts(checkOut) !== date) {
      throw new BadRequestException('Check-out time must belong to the selected attendance date');
    }
  }

  private assertNotFutureDate(date: string) {
    const today = this.todayIndia();

    if (date > today) {
      throw new BadRequestException('Attendance regularization cannot be requested for a future date');
    }
  }

  private assertCanRaise(user: any) {
    if (this.isRoot(user)) {
      return;
    }

    if (!this.isStaffRole(user.role)) {
      throw new ForbiddenException('This account cannot raise attendance regularization');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Your account is inactive');
    }
  }

  // ============================================================
  // ATTENDANCE HELPERS
  // ============================================================

  private classifyWorkingMinutes(
    workingMinutes: number,
    shift: any
  ): {
    status: 'present' | 'half_day' | 'absent';

    attendanceType: 'full_day' | 'half_day' | null;
  } {
    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

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

  private isLate(checkIn: Date, shift: any): 'on_time' | 'late' {
    const shiftStart = this.shiftStartForDate(checkIn, shift);

    const graceMinutes = Math.max(0, Number(shift.graceMinutes ?? 0));

    return checkIn.getTime() > shiftStart.getTime() + graceMinutes * 60000 ? 'late' : 'on_time';
  }

  private shiftFromSnapshot(snapshot: any) {
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

    return {
      shiftId: String(snapshot.shiftId ?? snapshot.id ?? 'historical'),

      startHour: Number(snapshot.startHour),

      startMinute: Number(snapshot.startMinute),

      endHour: Number(snapshot.endHour),

      endMinute: Number(snapshot.endMinute),

      graceMinutes: Number(snapshot.graceMinutes ?? 0),

      halfDayMinutes: Number(snapshot.halfDayMinutes ?? 240),

      fullDayMinutes: Number(snapshot.fullDayMinutes ?? 480),

      weeklyOff: Array.isArray(snapshot.weeklyOff) ? snapshot.weeklyOff : [],
    };
  }

  private shiftStartForDate(date: Date, shift: any): Date {
    const localDate = this.getIndiaDateParts(date);

    return new Date(
      `${localDate}T${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}:00+05:30`
    );
  }

  // ============================================================
  // ATTENDANCE HISTORY
  // ============================================================

  private attendanceStateMatches(current: any, original: any): boolean {
    return (
      this.dateValue(current.checkInTime) === this.dateValue(original.checkInTime) &&
      this.dateValue(current.checkOutTime) === this.dateValue(original.checkOutTime) &&
      Number(current.workingMinutes ?? 0) === Number(original.workingMinutes ?? 0) &&
      String(current.status ?? '') === String(original.status ?? '')
    );
  }

  private serializeForHistory(data: any) {
    if (!data) {
      return null;
    }

    return {
      checkInTime: data.checkInTime ?? null,

      checkOutTime: data.checkOutTime ?? null,

      workingMinutes: Number(data.workingMinutes ?? 0),

      status: data.status ?? null,

      attendanceType: data.attendanceType ?? null,

      punctuality: data.punctuality ?? null,

      shiftSnapshot: data.shiftSnapshot ?? null,

      leaveRequestId: data.leaveRequestId ?? null,

      leaveTypeId: data.leaveTypeId ?? null,

      leaveDuration: data.leaveDuration ?? null,

      leaveStatus: data.leaveStatus ?? null,

      checkoutCount: data.checkoutCount != null ? Number(data.checkoutCount) : null,

      checkoutHistory: Array.isArray(data.checkoutHistory) ? data.checkoutHistory : [],
    };
  }

  // ============================================================
  // FIRESTORE HELPERS
  // ============================================================

  private attendanceRecordRef(userId: string, date: string) {
    return this.db.collection('attendance').doc(userId).collection('records').doc(this.dateKey(date));
  }

  private async getUser(userId: string): Promise<any> {
    const doc = await this.db.collection('user').doc(userId).get();

    if (!doc.exists) {
      throw new NotFoundException('User not found');
    }

    return {
      uid: doc.id,

      ...(doc.data() ?? {}),
    };
  }

  private async getPermissions(userId: string): Promise<Record<string, boolean>> {
    const ref = this.db.collection('user').doc(userId).collection('settings').doc('permissions');

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return {};
    }

    return (snapshot.data() ?? {}) as Record<string, boolean>;
  }

  private getRootId(user: any): string | undefined {
    if (this.isRoot(user)) {
      return user.rootId ?? user.uid;
    }

    return user.rootId;
  }

  private isRoot(user: any): boolean {
    return AttendanceRegularizationService.ROOT_ROLES.has(user.role ?? '');
  }

  private isStaffRole(role?: string) {
    return AttendanceRegularizationService.STAFF_ROLES.has(role ?? '');
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private normalizeDate(value: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('Invalid attendance date');
    }

    let date: Date;

    /*
     * YYYY-MM-DD
     */
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date = this.localDate(value);
    } else {
      /*
       * ISO 8601
       */
      date = this.parseDate(value);
    }

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid attendance date');
    }

    const formatted = this.getIndiaDateParts(date);

    /*
     * If a plain YYYY-MM-DD was supplied,
     * make sure it was actually valid.
     */
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && formatted !== value) {
      throw new BadRequestException('Invalid attendance date');
    }

    return formatted;
  }

  private parseDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date/time');
    }

    return date;
  }

  private todayIndia(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceRegularizationService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    return formatter.format(new Date());
  }

  private getIndiaDateParts(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceRegularizationService.TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    return formatter.format(date);
  }

  private localDate(date: string): Date {
    return new Date(`${date}T00:00:00+05:30`);
  }

  private dateKey(date: string): string {
    return date.replace(/-/g, '');
  }

  private validateMonthYear(month: number, year: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month');
    }

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException('Invalid year');
    }
  }

  // ============================================================
  // VALUE HELPERS
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
      return new Date(value._seconds * 1000 + Math.floor(Number(value._nanoseconds ?? 0) / 1000000));
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dateValue(value: any): number | null {
    const date = this.toDate(value);

    return date ? date.getTime() : null;
  }

  private timestampValue(value: any): number {
    const date = this.toDate(value);

    return date ? date.getTime() : 0;
  }
}
