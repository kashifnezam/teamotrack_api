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

import { CreateAttendanceRegularizationDto } from './dto/create-attendance-regularization.dto';

import { AttendanceRegularizationResult } from './dto/review-attendance-regularization.dto';

@Injectable()
export class AttendanceRegularizationService {
  private readonly logger = new Logger(AttendanceRegularizationService.name);

  private static readonly TIME_ZONE = 'Asia/Kolkata';

  /*
   * Accounts allowed to raise regularization.
   */
  private static readonly STAFF_ROLES = new Set(['field_executive', 'manager', 'hr']);

  /*
   * Root-level accounts.
   */
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

    /*
     * Root manager does not use attendance regularization.
     */
    if (this.isRoot(requester)) {
      throw new BadRequestException('Root manager attendance does not use regularization approval');
    }

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    /*
     * Existing architecture:
     *
     * Employee / Field Executive
     *      ↓
     * parentId = Manager
     *
     * HR
     *      ↓
     * parentId = Manager
     *
     * Manager
     *      ↓
     * parentId = Root
     *
     * If parentId is missing, preserve the existing
     * fallback to root for manager-level records.
     */
    let parentId = requester.parentId;

    if (!parentId) {
      parentId = rootId;
    }

    const parent = await this.getUser(parentId);

    /*
     * Make sure the parent belongs to the same root.
     */
    if (this.getRootId(parent) !== rootId) {
      throw new ForbiddenException('Invalid parent manager hierarchy');
    }

    const date = this.normalizeDate(dto.date);

    /*
     * Future attendance cannot be regularized.
     */
    this.assertNotFutureDate(date);

    /*
     * ------------------------------------------------------------
     * DUPLICATE CHECK
     * ------------------------------------------------------------
     *
     * Only one pending/active regularization should exist
     * for an employee/date.
     *
     * A previously rejected/cancelled request does not block
     * a new request.
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
     * ------------------------------------------------------------
     * EXISTING ATTENDANCE
     * ------------------------------------------------------------
     *
     * We keep a small snapshot for audit/conflict protection.
     *
     * We do NOT ask the employee to supply check-in/out data.
     */
    const attendanceRef = this.attendanceRecordRef(requester.uid, date);

    const attendanceSnapshot = await attendanceRef.get();

    const existingAttendance = attendanceSnapshot.exists ? (attendanceSnapshot.data() ?? {}) : null;

    const now = Timestamp.fromDate(new Date());

    const ref = this.db.collection('attendanceRegularizations').doc();

    const data = {
      rootId,

      userId: requester.uid,
      userName: requester.fullName ?? '',
      userRole: requester.role ?? '',

      parentId,
      parentName: parent.fullName ?? '',

      date,

      /*
       * Employee input.
       */
      reason: dto.reason.trim(),

      attachmentUrl: dto.attachmentUrl?.trim() || null,

      /*
       * Attendance state at the time of request.
       *
       * This is for audit only.
       */
      previousAttendance: existingAttendance ? this.serializeForHistory(existingAttendance) : null,

      /*
       * There is now one approval decision.
       *
       * Manager or HR acting for that manager.
       */
      approverId: parent.uid,
      approverName: parent.fullName ?? '',

      /*
       * Manager has not selected the final attendance
       * status yet.
       */
      attendanceStatus: null,

      /*
       * Request lifecycle.
       */
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

      reason: dto.reason.trim(),

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

    return {
      requests,
    };
  }

  // ============================================================
  // PENDING APPROVALS
  // ============================================================

  async getApprovals(userId: string) {
    const requester = await this.getUser(userId);

    await this.assertCanApprove(requester);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
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
      .filter((request: any) => this.canProcessRequest(requester, request))
      .sort((a: any, b: any) => this.timestampValue(b.createdAt) - this.timestampValue(a.createdAt));

    return {
      requests,
    };
  }

  // ============================================================
  // PROCESSING HISTORY
  // ============================================================

  async getHistory(userId: string, month?: number, year?: number, status?: string) {
    const requester = await this.getUser(userId);

    await this.assertCanApprove(requester);

    const rootId = this.getRootId(requester);

    if (!rootId) {
      throw new BadRequestException('Invalid hierarchy: rootId missing');
    }

    this.validateOptionalMonthYear(month, year);

    const normalizedStatus = this.normalizeHistoryStatus(status);

    let query = this.db.collection('attendanceRegularizations').where('rootId', '==', rootId);

    /*
     * If no status is supplied, return processed requests.
     */
    if (normalizedStatus) {
      query = query.where('status', '==', normalizedStatus);
    } else {
      query = query.where('status', 'in', ['regularized', 'rejected']);
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

    /*
     * Tenant isolation.
     */
    if (data.rootId !== this.getRootId(requester)) {
      throw new NotFoundException('Attendance regularization not found');
    }

    /*
     * Employee can always view own request.
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
     * Manager/HR with attendance.manage permission
     * can access requests within their scope.
     */
    await this.assertCanApprove(requester);

    if (this.canProcessRequest(requester, data)) {
      return {
        id,
        ...data,
      };
    }

    /*
     * For already processed records, allow the manager/HR
     * who belongs to the same manager scope.
     */
    if (this.canViewHistory(requester, data)) {
      return {
        id,
        ...data,
      };
    }

    throw new ForbiddenException('You are not authorized to view this attendance regularization');
  }

  // ============================================================
  // REGULARIZE
  // ============================================================

  async regularize(userId: string, id: string, attendanceStatus: AttendanceRegularizationResult) {
    const approver = await this.getUser(userId);

    await this.assertCanApprove(approver);

    this.validateAttendanceResult(attendanceStatus);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = snapshot.data() ?? {};

    /*
     * Tenant isolation.
     */
    if (data.rootId !== this.getRootId(approver)) {
      throw new NotFoundException('Attendance regularization not found');
    }

    /*
     * Cannot process own request.
     */
    if (data.userId === approver.uid) {
      throw new BadRequestException('You cannot process your own attendance regularization');
    }

    /*
     * Must still be pending.
     */
    if (data.status !== 'pending') {
      throw new BadRequestException('Attendance regularization is no longer pending');
    }

    /*
     * Manager / HR scope authorization.
     */
    if (!this.canProcessRequest(approver, data)) {
      throw new ForbiddenException('You are not authorized to process this attendance regularization');
    }

    /*
     * Apply the manager's attendance decision.
     *
     * This does NOT create check-in/check-out times.
     */
    await this.applyRegularization(id, data, approver, attendanceStatus);

    const now = Timestamp.fromDate(new Date());

    await ref.update({
      status: 'regularized',

      attendanceStatus,

      regularizedBy: approver.uid,

      regularizedByRole: approver.role ?? null,

      regularizedAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),

      /*
       * Keep a concise decision audit.
       */
      decision: {
        attendanceStatus,
        decidedBy: approver.uid,
        decidedByRole: approver.role ?? null,
        decidedAt: now,
      },
    });

    this.logger.log(
      `Attendance regularization regularized | id=${id} | result=${attendanceStatus} | approver=${approver.uid}`
    );

    return {
      success: true,

      id,

      status: 'regularized',

      attendanceStatus,

      regularizedBy: approver.uid,

      message: 'Attendance regularized successfully.',
    };
  }

  // ============================================================
  // REJECT
  // ============================================================

  async reject(userId: string, id: string, reason?: string) {
    const approver = await this.getUser(userId);

    await this.assertCanApprove(approver);

    const ref = this.db.collection('attendanceRegularizations').doc(id);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = snapshot.data() ?? {};

    /*
     * Tenant isolation.
     */
    if (data.rootId !== this.getRootId(approver)) {
      throw new NotFoundException('Attendance regularization not found');
    }

    if (data.userId === approver.uid) {
      throw new BadRequestException('You cannot process your own attendance regularization');
    }

    if (data.status !== 'pending') {
      throw new BadRequestException('Attendance regularization is no longer pending');
    }

    if (!this.canProcessRequest(approver, data)) {
      throw new ForbiddenException('You are not authorized to process this attendance regularization');
    }

    const rejectionReason = reason?.trim() ?? '';

    if (reason != null && rejectionReason.length < 3) {
      throw new BadRequestException('Rejection reason must contain at least 3 characters');
    }

    await ref.update({
      status: 'rejected',

      attendanceStatus: null,

      rejectionReason,

      rejectedBy: approver.uid,

      rejectedByRole: approver.role ?? null,

      rejectedAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    this.logger.log(`Attendance regularization rejected | id=${id} | approver=${approver.uid}`);

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

    const snapshot = await ref.get();

    if (!snapshot.exists || snapshot.data()?.rootId !== rootId) {
      throw new NotFoundException('Attendance regularization not found');
    }

    const data = snapshot.data()!;

    /*
     * Only the employee who created the request
     * can cancel it.
     */
    if (data.userId !== requester.uid) {
      throw new ForbiddenException('You can only cancel your own regularization requests');
    }

    if (data.status !== 'pending') {
      throw new BadRequestException('Only pending regularization requests can be cancelled');
    }

    await ref.update({
      status: 'cancelled',

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
  // APPLY REGULARIZATION
  // ============================================================

  private async applyRegularization(
    regularizationId: string,
    data: any,
    approver: any,
    attendanceStatus: AttendanceRegularizationResult
  ) {
    const attendanceRef = this.attendanceRecordRef(data.userId, data.date);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attendanceRef);

      const current = snapshot.exists ? (snapshot.data() ?? {}) : {};

      /*
       * --------------------------------------------------------
       * CONFLICT PROTECTION
       * --------------------------------------------------------
       *
       * If attendance changed after the employee submitted
       * the request, do not silently overwrite the newer data.
       *
       * Example:
       *
       * Employee submits regularization at 10:00.
       * Employee later checks in at 10:30.
       * Manager tries to regularize at 12:00.
       *
       * The manager must not unknowingly overwrite that
       * newer attendance state.
       */
      const original = data.previousAttendance;

      if (original && !this.attendanceStateMatches(current, original)) {
        throw new ConflictException(
          'Attendance has changed since this regularization request was submitted. Please review the current attendance before applying the correction.'
        );
      }

      /*
       * --------------------------------------------------------
       * DETERMINE ATTENDANCE VALUES
       * --------------------------------------------------------
       *
       * IMPORTANT:
       *
       * We do NOT manufacture check-in/check-out times.
       *
       * The employee did not provide corrected punch times,
       * and the manager is only deciding the attendance result.
       */
      let status: 'present' | 'absent';

      let attendanceType: 'full_day' | 'half_day' | null;

      switch (attendanceStatus) {
        case AttendanceRegularizationResult.FULL_DAY:
          status = 'present';
          attendanceType = 'full_day';
          break;

        case AttendanceRegularizationResult.HALF_DAY:
          status = 'present';
          attendanceType = 'half_day';
          break;

        case AttendanceRegularizationResult.ABSENT:
          status = 'absent';
          attendanceType = null;
          break;

        default:
          throw new BadRequestException('Invalid attendance regularization result');
      }

      /*
       * --------------------------------------------------------
       * REGULARIZATION HISTORY
       * --------------------------------------------------------
       */
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

        attendanceStatus,

        /*
         * Record what attendance looked like before
         * management regularized it.
         */
        previous: this.serializeForHistory(current),

        /*
         * Record the final decision.
         */
        resulting: {
          status,

          attendanceType,

          /*
           * We intentionally don't manufacture working minutes.
           */
          workingMinutes: current.workingMinutes ?? null,
        },

        recordedAt: now,
      });

      /*
       * --------------------------------------------------------
       * ATTENDANCE UPDATE
       * --------------------------------------------------------
       */
      const update: FirebaseFirestore.DocumentData = {
        staffId: data.userId,

        rootId: data.rootId,

        date: current.date ?? data.date,

        /*
         * Manager's final attendance decision.
         */
        status,

        attendanceType,

        /*
         * Regularization information.
         */
        regularizationId,

        regularized: true,

        regularizedBy: approver.uid,

        regularizedByRole: approver.role ?? null,

        regularizedAt: FieldValue.serverTimestamp(),

        regularizationReason: data.reason ?? '',

        /*
         * Keep the final decision explicitly available
         * on attendance.
         */
        regularizationAttendanceStatus: attendanceStatus,

        regularizationHistory: history.slice(-20),

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * --------------------------------------------------------
       * IMPORTANT: DO NOT TOUCH CHECK-IN/CHECK-OUT
       * --------------------------------------------------------
       *
       * Existing punches, if any, remain exactly as they are.
       *
       * If they are missing, they remain missing.
       *
       * Regularization changes the attendance classification,
       * not the historical punch data.
       */

      /*
       * Preserve historical shift information.
       */
      if (current.shiftSnapshot) {
        update.shiftSnapshot = current.shiftSnapshot;
      }

      /*
       * Preserve leave information.
       */
      for (const field of ['leaveRequestId', 'leaveTypeId', 'leaveDuration', 'leaveStatus']) {
        if (current[field] != null) {
          update[field] = current[field];
        }
      }

      transaction.set(attendanceRef, update, {
        merge: true,
      });
    });

    this.logger.log(
      `Attendance regularization applied | regularization=${regularizationId} | staff=${data.userId} | result=${attendanceStatus} | approver=${approver.uid}`
    );
  }

  // ============================================================
  // AUTHORIZATION
  // ============================================================

  private async assertCanApprove(user: any) {
    /*
     * Root roles retain global access.
     */
    if (this.isRoot(user)) {
      return;
    }

    if (!['manager', 'hr'].includes(user.role ?? '')) {
      throw new ForbiddenException('You are not authorized to manage attendance regularization');
    }

    const permissions = await this.getPermissions(user.uid);

    if (!this.hasAttendanceManagePermission(permissions)) {
      throw new ForbiddenException('Permission denied');
    }
  }

  private hasAttendanceManagePermission(permissions: Record<string, boolean>): boolean {
    return permissions['attendance.manage'] === true;
  }

  /*
   * Determines whether a manager/HR can process
   * a particular request.
   */
  private canProcessRequest(requester: any, request: any): boolean {
    /*
     * Root can process everything.
     */
    if (this.isRoot(requester)) {
      return true;
    }

    /*
     * Request must belong to the same tenant.
     */
    if (request.rootId !== this.getRootId(requester)) {
      return false;
    }

    /*
     * ----------------------------------------------------------
     * MANAGER
     * ----------------------------------------------------------
     *
     * Manager processes requests belonging to them.
     */
    if (requester.role === 'manager') {
      return request.parentId === requester.uid;
    }

    /*
     * ----------------------------------------------------------
     * HR
     * ----------------------------------------------------------
     *
     * HR acts on behalf of its parent manager.
     */
    if (requester.role === 'hr' && requester.parentId) {
      return request.parentId === requester.parentId;
    }

    return false;
  }

  private canViewHistory(requester: any, request: any): boolean {
    /*
     * Root sees everything.
     */
    if (this.isRoot(requester)) {
      return true;
    }

    /*
     * Manager/HR see their own processing scope.
     */
    return this.canProcessRequest(requester, request);
  }

  // ============================================================
  // REQUEST VALIDATION
  // ============================================================

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

  private validateAttendanceResult(value: AttendanceRegularizationResult) {
    if (!Object.values(AttendanceRegularizationResult).includes(value)) {
      throw new BadRequestException('Invalid attendance status');
    }
  }

  private assertNotFutureDate(date: string) {
    if (date > this.todayIndia()) {
      throw new BadRequestException('Attendance regularization cannot be requested for a future date');
    }
  }

  // ============================================================
  // ATTENDANCE HISTORY / CONFLICT
  // ============================================================

  private attendanceStateMatches(current: any, original: any): boolean {
    /*
     * We intentionally compare the important attendance
     * state only.
     *
     * Regularization itself should not trigger a conflict
     * because it happens after this comparison.
     */
    return (
      this.dateValue(current.checkInTime) === this.dateValue(original.checkInTime) &&
      this.dateValue(current.checkOutTime) === this.dateValue(original.checkOutTime) &&
      Number(current.workingMinutes ?? 0) === Number(original.workingMinutes ?? 0) &&
      String(current.status ?? '') === String(original.status ?? '') &&
      String(current.attendanceType ?? '') === String(original.attendanceType ?? '') &&
      Number(current.checkoutCount ?? 0) === Number(original.checkoutCount ?? 0) &&
      this.historyMatches(current.checkoutHistory, original.checkoutHistory) &&
      this.historyMatches(current.breakHistory, original.breakHistory) &&
      this.breakStateMatches(current.currentBreak, original.currentBreak) &&
      Number(current.totalBreakMinutes ?? 0) === Number(original.totalBreakMinutes ?? 0)
    );
  }

  private historyMatches(current: any, original: any): boolean {
    const currentHistory = Array.isArray(current) ? current : [];

    const originalHistory = Array.isArray(original) ? original : [];

    return (
      JSON.stringify(currentHistory.map((item: any) => this.normalizeHistoryItem(item))) ===
      JSON.stringify(originalHistory.map((item: any) => this.normalizeHistoryItem(item)))
    );
  }

  private normalizeHistoryItem(item: any): any {
    if (!item || typeof item !== 'object') {
      return item ?? null;
    }

    return {
      ...item,

      startTime: this.dateValue(item.startTime),

      endTime: this.dateValue(item.endTime),

      checkoutTime: this.dateValue(item.checkoutTime),

      cancelledAt: this.dateValue(item.cancelledAt),
    };
  }

  private breakStateMatches(current: any, original: any): boolean {
    if (!current && !original) {
      return true;
    }

    if (!current || !original) {
      return false;
    }

    return (
      Boolean(current.active) === Boolean(original.active) &&
      this.dateValue(current.startTime) === this.dateValue(original.startTime)
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

      currentBreak: data.currentBreak ?? null,

      breakHistory: Array.isArray(data.breakHistory) ? data.breakHistory : [],

      totalBreakMinutes: data.totalBreakMinutes != null ? Number(data.totalBreakMinutes) : 0,
    };
  }

  // ============================================================
  // HISTORY HELPERS
  // ============================================================

  private normalizeHistoryStatus(status?: string): 'regularized' | 'rejected' | undefined {
    if (status == null || status === '') {
      return undefined;
    }

    const value = String(status).trim().toLowerCase();

    if (value !== 'regularized' && value !== 'rejected') {
      throw new BadRequestException('Invalid history status. Allowed values are regularized or rejected');
    }

    return value as 'regularized' | 'rejected';
  }

  private getHistoryActionTimestamp(request: any): number {
    const status = String(request?.status ?? '').toLowerCase();

    if (status === 'regularized') {
      const value = this.timestampValue(request.regularizedAt);

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

  // ============================================================
  // MONTH HELPERS
  // ============================================================

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
