import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
  // CREATE
  // ============================================================

  async create(requesterId: string, dto: CreateAttendanceRegularizationDto) {
    const requester = await this.getUser(requesterId);

    this.assertCanRaise(requester);

    if (this.isRoot(requester)) {
      throw new BadRequestException('Root manager attendance does not use regularization approval');
    }

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    if (!requester.parentId) {
      throw new BadRequestException('No parent manager is assigned to this account');
    }

    const date = this.normalizeDate(dto.date);

    this.assertNotFutureDate(date);

    const checkInTime = dto.checkInTime ? this.parseDate(dto.checkInTime) : null;

    const checkOutTime = dto.checkOutTime ? this.parseDate(dto.checkOutTime) : null;

    this.validateRequestedTimes(dto.type, date, checkInTime, checkOutTime);

    const parent = await this.getUser(requester.parentId);

    if (this.getRootId(parent) !== rootId) {
      throw new ForbiddenException('Invalid parent manager hierarchy');
    }

    const attendanceRef = this.attendanceRecordRef(requester.uid, date);

    const attendanceSnapshot = await attendanceRef.get();

    const existingAttendance = attendanceSnapshot.exists ? (attendanceSnapshot.data() ?? {}) : null;

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

    const now = Timestamp.fromDate(new Date());

    const ref = this.db.collection('attendanceRegularizations').doc();

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

      previousAttendance: existingAttendance ? this.serializeForHistory(existingAttendance) : null,

      approval: [
        {
          level: 0,
          userId: parent.uid,
          status: 'pending',
          createdAt: now,
        },
      ],

      currentLevel: 0,

      status: 'pending',

      createdAt: now,
      updatedAt: now,
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

    this.validateOptionalMonthYear(month, year);

    let query = this.db
      .collection('attendanceRegularizations')
      .where('rootId', '==', rootId)
      .where('userId', '==', userId);

    query = this.applyMonthFilter(query, month, year);

    const snapshot = await query.get();

    const requests = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));

    return { requests };
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

    await this.assertCanApprove(requester);

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
        if (requester.role === 'hr' && (request.userRole === 'manager' || request.userRole === 'hr')) {
          return false; // HR cannot approve requests from managers or other HRs
        }
        const level = Number(request.currentLevel ?? 0);

        const step = Array.isArray(request.approval)
          ? request.approval.find((item: any) => Number(item.level) === level)
          : undefined;

        return this.isApprover(requester, step);
      })
      .sort((a: any, b: any) => this.timestampValue(b.createdAt) - this.timestampValue(a.createdAt));

    return { requests };
  }

  // ============================================================
  // PROCESSING HISTORY
  // ============================================================

  async getHistory(userId: string, month?: number, year?: number, status?: string) {
    const requester = await this.getUser(userId);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * attendance.manage is the only processing permission.
     */
    await this.assertCanApprove(requester);

    this.validateOptionalMonthYear(month, year);

    const normalizedStatus = this.normalizeHistoryStatus(status);

    let query = this.db.collection('attendanceRegularizations').where('rootId', '==', rootId);

    if (normalizedStatus) {
      query = query.where('status', '==', normalizedStatus);
    } else {
      query = query.where('status', 'in', ['approved', 'rejected']);
    }

    query = this.applyMonthFilter(query, month, year);

    const snapshot = await query.get();

    const requests = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((request: any) => this.canViewHistory(requester, request))
      .sort((a: any, b: any) => this.getHistoryActionTimestamp(b) - this.getHistoryActionTimestamp(a));

    return { requests };
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
     * Owner can always view own request.
     */
    if (data.userId === requester.uid) {
      return {
        id,
        ...data,
      };
    }

    /*
     * Root can view everything.
     */
    if (this.isRoot(requester)) {
      return {
        id,
        ...data,
      };
    }

    /*
     * HR acts on behalf of parent manager.
     *
     * Therefore HR can view the complete
     * parent-manager history.
     */
    if (
      requester.role === 'hr' &&
      requester.parentId &&
      this.hasAttendanceManagePermission(await this.getPermissions(requester.uid)) &&
      this.belongsToManagerScope(data, requester.parentId)
    ) {
      return {
        id,
        ...data,
      };
    }

    /*
     * A manager/HR who actually processed
     * the request can view its history.
     */
    if (this.hasProcessedRequest(requester, data)) {
      return {
        id,
        ...data,
      };
    }

    /*
     * Finally allow current pending approver.
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

    const { ref, data, steps, step } = await this.getPendingRequest(approver, id);

    const now = Timestamp.fromDate(new Date());

    step.status = 'approved';
    step.approvedBy = approver.uid;
    step.approvedByRole = approver.role ?? null;
    step.approvedAt = now;

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

    this.logger.log(`Attendance regularization approved | id=${id} | approver=${approver.uid} | role=${approver.role}`);

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

    const { ref, steps, step } = await this.getPendingRequest(approver, id);

    const rejectionReason = reason?.trim() ?? '';

    if (reason != null && rejectionReason.length < 3) {
      throw new BadRequestException('Rejection reason must contain at least 3 characters');
    }

    const now = Timestamp.fromDate(new Date());

    step.status = 'rejected';
    step.rejectedBy = approver.uid;
    step.rejectedByRole = approver.role ?? null;
    step.rejectedAt = now;

    await ref.update({
      approval: steps,

      currentLevel: null,

      status: 'rejected',

      rejectionReason,

      rejectedBy: approver.uid,
      rejectedByRole: approver.role ?? null,
      rejectedAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    this.logger.log(`Attendance regularization rejected | id=${id} | approver=${approver.uid} | role=${approver.role}`);

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

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

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
  // PENDING REQUEST
  // ============================================================

  private async getPendingRequest(user: any, id: string) {
    await this.assertCanApprove(user);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = snapshot.data() ?? {};

    if (data.rootId !== this.getRootId(user)) {
      throw new NotFoundException('Attendance regularization not found');
    }

    if (data.status !== 'pending') {
      throw new BadRequestException('Attendance regularization is not pending');
    }

    if (data.userId === user.uid) {
      throw new BadRequestException('You cannot process your own attendance regularization');
    }

    const level = Number(data.currentLevel ?? 0);

    const steps = Array.isArray(data.approval) ? data.approval : [];

    const step = steps.find((item: any) => Number(item.level) === level);

    if (!this.isApprover(user, step)) {
      throw new ForbiddenException('You are not authorized to process this attendance regularization');
    }

    return {
      ref,
      data,
      steps,
      step,
    };
  }

  // ============================================================
  // APPLY APPROVED REGULARIZATION
  // ============================================================

  private async applyApprovedRegularization(regularizationId: string, data: any, approver: any) {
    const attendanceRef = this.attendanceRecordRef(data.userId, data.date);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attendanceRef);

      const current = snapshot.exists ? (snapshot.data() ?? {}) : {};

      /*
       * Prevent overwriting attendance
       * changed after request creation.
       */
      const original = data.previousAttendance;

      if (original && !this.attendanceStateMatches(current, original)) {
        throw new ConflictException(
          'Attendance has changed since this regularization request was submitted. Please review the current attendance before applying the correction.'
        );
      }

      const shift = this.shiftFromSnapshot(current.shiftSnapshot);

      if (!shift) {
        throw new BadRequestException('Historical shift information is missing from attendance record');
      }

      const existingCheckIn = this.toDate(current.checkInTime);

      const existingCheckOut = this.toDate(current.checkOutTime);

      const requestedCheckIn = data.requestedCheckInTime ? this.toDate(data.requestedCheckInTime) : null;

      const requestedCheckOut = data.requestedCheckOutTime ? this.toDate(data.requestedCheckOutTime) : null;

      /*
       * Null means preserve existing value.
       */
      const finalCheckIn = requestedCheckIn ?? existingCheckIn;

      const finalCheckOut = requestedCheckOut ?? existingCheckOut;

      if (!finalCheckIn && !finalCheckOut) {
        throw new BadRequestException('At least one valid check-in or check-out time is required');
      }

      if (finalCheckOut && !finalCheckIn) {
        throw new BadRequestException('Check-in time is required when correcting check-out');
      }

      if (finalCheckIn && finalCheckOut && finalCheckOut.getTime() <= finalCheckIn.getTime()) {
        throw new BadRequestException('Checkout time must be after check-in time');
      }

      let workingMinutes = 0;

      let status: 'present' | 'absent' | 'half_day' = 'absent';

      let attendanceType: 'full_day' | 'half_day' | null = null;

      let punctuality: 'on_time' | 'late' | null = null;

      if (finalCheckIn) {
        punctuality = this.isLate(finalCheckIn, shift);
      }

      if (finalCheckIn && finalCheckOut) {
        const shiftStart = this.shiftStartForDate(finalCheckIn, shift);

        const effectiveCheckIn = finalCheckIn.getTime() < shiftStart.getTime() ? shiftStart : finalCheckIn;

        workingMinutes = Math.max(0, Math.round((finalCheckOut.getTime() - effectiveCheckIn.getTime()) / 60000));

        const classification = this.classifyWorkingMinutes(workingMinutes, shift);

        status = classification.status;

        attendanceType = classification.attendanceType;
      } else {
        status = 'present';
        attendanceType = 'full_day';
      }

      const history = Array.isArray(current.regularizationHistory) ? [...current.regularizationHistory] : [];

      const now = Timestamp.fromDate(new Date());

      history.push({
        action: 'REGULARIZATION_APPLIED',

        regularizationId,

        requestedBy: data.userId,

        requestedByRole: data.userRole ?? null,

        approvedBy: approver.uid,

        approvedByRole: approver.role ?? null,

        approvedAt: now,

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

        recordedAt: now,
      });

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

        regularizationHistory: history.slice(-20),

        updatedAt: FieldValue.serverTimestamp(),

        checkoutUndoUntil: FieldValue.delete(),

        lastCheckoutAt: finalCheckOut ? Timestamp.fromDate(finalCheckOut) : FieldValue.delete(),
      };

      /*
       * Check-in.
       */
      update.checkInTime = finalCheckIn ? Timestamp.fromDate(finalCheckIn) : FieldValue.delete();

      /*
       * Check-out.
       */
      update.checkOutTime = finalCheckOut ? Timestamp.fromDate(finalCheckOut) : FieldValue.delete();

      /*
       * Punctuality.
       */
      update.punctuality = punctuality ? punctuality : FieldValue.delete();

      /*
       * Preserve leave information.
       */
      for (const field of ['leaveRequestId', 'leaveTypeId', 'leaveDuration', 'leaveStatus']) {
        if (current[field] != null) {
          update[field] = current[field];
        }
      }

      /*
       * Never replace historical shift.
       */
      if (current.shiftSnapshot) {
        update.shiftSnapshot = current.shiftSnapshot;
      }

      transaction.set(attendanceRef, update, { merge: true });
    });

    this.logger.log(
      `Attendance regularization applied | regularization=${regularizationId} | staff=${data.userId} | approver=${approver.uid}`
    );
  }

  // ============================================================
  // HISTORY ACCESS
  // ============================================================

  private canViewHistory(requester: any, request: any): boolean {
    /*
     * Root roles:
     * everything.
     */
    if (this.isRoot(requester)) {
      return true;
    }

    /*
     * HR acts as the parent manager.
     *
     * HR's parentId identifies the manager whose
     * attendance/regularization scope HR handles.
     */
    if (requester.userRole === 'hr' && requester.parentId) {
      return this.belongsToManagerScope(request, requester.parentId);
    }

    /*
     * Manager:
     * only requests actually processed by this manager.
     */
    return this.hasProcessedRequest(requester, request);
  }

  private belongsToManagerScope(request: any, managerId?: string): boolean {
    if (!managerId) {
      return false;
    }

    /*
     * Current regularization structure.
     */
    if (request.parentId === managerId) {
      return true;
    }

    /*
     * Approval-chain fallback for older records.
     */
    if (Array.isArray(request.approval)) {
      return request.approval.some((step: any) => step.userId === managerId);
    }

    return false;
  }

  private hasProcessedRequest(requester: any, request: any): boolean {
    if (!requester?.uid || !request) {
      return false;
    }

    if (request.approvedBy === requester.uid || request.rejectedBy === requester.uid) {
      return true;
    }

    return Array.isArray(request.approval)
      ? request.approval.some((step: any) => step.approvedBy === requester.uid || step.rejectedBy === requester.uid)
      : false;
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

    if (!this.hasAttendanceManagePermission(permissions)) {
      throw new ForbiddenException('Permission denied');
    }
  }

  private hasAttendanceManagePermission(permissions: Record<string, boolean>): boolean {
    return permissions['attendance.manage'] === true;
  }

  private async assertApprovalAccess(user: any, data: any) {
    if (this.isRoot(user)) {
      return;
    }

    if (this.hasProcessedRequest(user, data)) {
      return;
    }

    if (user.role === 'hr' && user.parentId) {
      const permissions = await this.getPermissions(user.uid);

      if (this.hasAttendanceManagePermission(permissions) && this.belongsToManagerScope(data, user.parentId)) {
        return;
      }
    }

    const level = Number(data.currentLevel ?? 0);

    const step = Array.isArray(data.approval)
      ? data.approval.find((item: any) => Number(item.level) === level)
      : undefined;

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
     * Direct manager.
     */
    if (step.userId === user.uid) {
      return true;
    }

    /*
     * HR acting on behalf of
     * parent manager.
     */
    return user.role === 'hr' && !!user.parentId && user.parentId === step.userId;
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

    if (checkIn && checkOut && checkOut.getTime() <= checkIn.getTime()) {
      throw new BadRequestException('Check-out time must be after check-in time');
    }

    if (checkIn && this.getIndiaDateParts(checkIn) !== date) {
      throw new BadRequestException('Check-in time must belong to the selected attendance date');
    }

    if (checkOut && this.getIndiaDateParts(checkOut) !== date) {
      throw new BadRequestException('Check-out time must belong to the selected attendance date');
    }
  }

  private assertNotFutureDate(date: string) {
    if (date > this.todayIndia()) {
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
  // ATTENDANCE CLASSIFICATION
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
  // HISTORY HELPERS
  // ============================================================

  private normalizeHistoryStatus(status?: string): 'approved' | 'rejected' | undefined {
    if (status == null || status === '') {
      return undefined;
    }

    const value = String(status).trim().toLowerCase();

    if (value !== 'approved' && value !== 'rejected') {
      throw new BadRequestException('Invalid history status');
    }

    return value as 'approved' | 'rejected';
  }

  private getHistoryActionTimestamp(request: any): number {
    const status = String(request?.status ?? '').toLowerCase();

    if (status === 'approved') {
      const value = this.timestampValue(request.approvedAt);

      if (value) {
        return value;
      }
    }

    if (status === 'rejected') {
      const value = this.timestampValue(request.rejectedAt);

      if (value) {
        return value;
      }
    }

    if (Array.isArray(request?.approval)) {
      const timestamps = request.approval
        .map((step: any) => {
          if (status === 'approved') {
            return this.timestampValue(step.approvedAt);
          }

          if (status === 'rejected') {
            return this.timestampValue(step.rejectedAt);
          }

          return 0;
        })
        .filter((value: number) => value > 0);

      if (timestamps.length) {
        return Math.max(...timestamps);
      }
    }

    return this.timestampValue(request.updatedAt);
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

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date = this.localDate(value);
    } else {
      date = this.parseDate(value);
    }

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid attendance date');
    }

    const formatted = this.getIndiaDateParts(date);

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
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceRegularizationService.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private getIndiaDateParts(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AttendanceRegularizationService.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
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

  private validateOptionalMonthYear(month?: number, year?: number) {
    if (month == null && year == null) {
      return;
    }

    if (month == null || year == null) {
      throw new BadRequestException('Both month and year are required');
    }

    this.validateMonthYear(month, year);
  }

  private applyMonthFilter(query: FirebaseFirestore.Query, month?: number, year?: number) {
    if (month == null || year == null) {
      return query;
    }

    const { start, end } = this.getMonthRange(month, year);

    return query.where('date', '>=', start).where('date', '<', end);
  }

  private getMonthRange(month: number, year: number) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;

    const nextMonth = month === 12 ? 1 : month + 1;

    const nextYear = month === 12 ? year + 1 : year;

    const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    return {
      start,
      end,
    };
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
