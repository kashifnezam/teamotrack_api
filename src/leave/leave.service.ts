import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

import { LeaveDto, LeaveTypeDto } from './dto/leave.dto';

import { FieldValue } from 'firebase-admin/firestore';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET MY LEAVES
  // ==================================================

  async getAll(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const snap = await this.db
      .collection('leaveRequests')
      .where('rootId', '==', rootId)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return {
      leaves: snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
    };
  }

  // ==================================================
  // TEAM LEAVE
  // ==================================================

  async getTeamLeaves(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const snap = await this.db
      .collection('leaveRequests')
      .where('rootId', '==', rootId)
      .orderBy('createdAt', 'desc')
      .get();

    let leaves: any[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    /*
     * Root authority sees
     * organization-wide leave history.
     */
    if (this.isRoot(user)) {
      return {
        leaves,
      };
    }

    /*
     * HR.
     *
     * HR does not become a hierarchy node.
     */
    if (user.role === 'hr') {
      const permissions = await this.getPermissions(user.uid);

      /*
       * Organization-wide HR access.
       */
      if (permissions['leave.view.all'] === true) {
        return {
          leaves,
        };
      }

      /*
       * HR must have a parent manager.
       */
      if (!user.parentId) {
        return {
          leaves: [],
        };
      }

      /*
       * Load parent manager.
       */
      const parentManager = await this.getUser(user.parentId);

      /*
       * Get actual descendants.
       *
       * HR itself is NOT part of the hierarchy.
       */
      const descendantIds = await this.getDescendantIds(parentManager);

      /*
       * Team Leave means descendants only.
       *
       * Managers and HR requests are excluded
       * from HR's team leave view.
       */
      leaves = leaves.filter((leave) => {
        if (user.role === 'hr' && (leave.role === 'manager' || leave.role === 'hr')) {
          return false;
        }

        return descendantIds.has(leave.userId);
      });

      return {
        leaves,
      };
    }

    /*
     * Field executive has no team.
     */
    if (user.role === 'field_executive') {
      return {
        leaves: [],
      };
    }

    /*
     * Manager hierarchy.
     */
    const permissions = await this.getPermissions(user.uid);

    if (permissions['leave.view'] !== true) {
      return {
        leaves: [],
      };
    }

    const descendantIds = await this.getDescendantIds(user);

    /*
     * Do not include own leave.
     */
    leaves = leaves.filter((leave) => descendantIds.has(leave.userId));

    return {
      leaves,
    };
  }

  // ==================================================
  // PENDING APPROVALS
  // ==================================================

  async getApprovals(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * Root / Manager / HR permission.
     */
    if (!this.isRoot(user)) {
      const permissions = await this.getPermissions(userId);

      if (user.role === 'hr') {
        if (permissions['leave.view'] !== true) {
          return {
            approvals: [],
          };
        }
      } else {
        if (permissions['leave.approve'] !== true) {
          return {
            approvals: [],
          };
        }
      }
    }

    const snap = await this.db
      .collection('leaveRequests')
      .where('rootId', '==', rootId)
      .where('status', '==', 'pending')
      .get();

    const approvals = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((leave: any) => {
        /*
         * HR cannot approve manager/HR requests.
         */
        if (user.role === 'hr' && (leave.role === 'manager' || leave.role === 'hr')) {
          return false;
        }

        const level = Number(leave.currentLevel);

        const step = leave.approval?.find((item: any) => Number(item.level) === level);

        if (!step || step.status !== 'pending') {
          return false;
        }

        /*
         * Direct approver.
         */
        if (step.userId === user.uid) {
          return true;
        }

        /*
         * HR can approve on behalf of
         * parent manager.
         */
        if (user.role === 'hr' && user.parentId === step.userId) {
          return true;
        }

        return false;
      });

    this.logger.log(`Approvals for ${userId}: ${approvals.length}`);

    return {
      approvals,
    };
  }

  // ==================================================
  // CREATE LEAVE
  // ==================================================

  async create(userId: string, dto: LeaveDto) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * Backend validation.
     */
    this.validate(dto);

    const type = await this.getLeaveType(rootId, dto.leaveTypeId);

    /*
     * Backend is authoritative
     * for leave duration.
     */
    const days = this.calculateLeaveDays(dto.startDate, dto.endDate, dto.durationUnit ?? 'day');

    if (days <= 0) {
      throw new BadRequestException('Invalid leave duration');
    }

    /*
     * Maximum request limit.
     */
    if (days > (type.maxDaysPerRequest ?? Infinity)) {
      throw new BadRequestException('Maximum leave limit exceeded');
    }

    /*
     * Half-day is allowed only when
     * leave type permits it.
     */
    if (dto.durationUnit === 'half_day' && type.allowHalfDay !== true) {
      throw new BadRequestException('Half-day leave is not allowed for this leave type');
    }

    /*
     * Explicit half-day validation.
     */
    this.validateHalfDay(dto);

    /*
     * Check leave balance.
     */
    await this.checkBalance(userId, dto.leaveTypeId, days);

    /*
     * Build approval chain.
     */
    const approval = type.requiresApproval ? await this.buildApprovalChain(user, type.approvalMode) : [];

    const autoApproved = !type.requiresApproval || type.approvalMode === 'auto';

    const status = autoApproved ? 'approved' : 'pending';

    const now = new Date();

    /*
     * Persist leave request.
     */
    const ref = await this.db.collection('leaveRequests').add({
      userId,

      userName: user.fullName || user.email || userId,

      rootId,

      role: user.role,

      leaveTypeId: dto.leaveTypeId,

      startDate: dto.startDate,

      endDate: dto.endDate,

      /*
       * Backend calculated.
       */
      days,

      durationUnit: dto.durationUnit ?? 'day',

      /*
       * Only half-day requests
       * contain a meaningful value.
       */
      halfDay: dto.durationUnit === 'half_day' ? dto.halfDay : null,

      reason: dto.reason ?? '',

      status,

      approval,

      currentLevel: autoApproved ? null : 0,

      createdAt: now,

      updatedAt: now,
    });

    /*
     * Auto-approved leave immediately
     * creates ledger/payroll/attendance records.
     */
    if (autoApproved) {
      await this.finalizeApprovedLeave(
        ref.id,
        user,
        {
          ...dto,
          days,

          /*
           * Ensure finalized data
           * contains normalized duration.
           */
          durationUnit: dto.durationUnit ?? 'day',

          halfDay: dto.durationUnit === 'half_day' ? dto.halfDay : null,
        },
        type
      );
    }

    this.logger.log(
      `Leave created | id=${ref.id} | user=${userId} | days=${days} | duration=${dto.durationUnit ?? 'day'} | halfDay=${dto.halfDay ?? 'none'}`
    );

    return {
      success: true,

      id: ref.id,

      status,

      days,

      durationUnit: dto.durationUnit ?? 'day',

      halfDay: dto.durationUnit === 'half_day' ? dto.halfDay : null,
    };
  }

  // ==================================================
  // UPDATE LEAVE
  // ==================================================

  async update(userId: string, id: string, dto: LeaveDto) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * Validate complete request.
     */
    this.validate(dto);

    /*
     * Validate half-day selection.
     */
    this.validateHalfDay(dto);

    const ref = this.db.collection('leaveRequests').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Leave request not found');
    }

    const data = doc.data()!;

    /*
     * Users can edit only their own leave.
     */
    if (data.userId !== userId) {
      throw new BadRequestException('You can only edit your own leave');
    }

    /*
     * Approved/rejected leave cannot
     * be edited.
     */
    if (!['draft', 'pending'].includes(data.status)) {
      throw new BadRequestException('Approved or rejected leave cannot be edited');
    }

    /*
     * Get leave type.
     */
    const type = await this.getLeaveType(rootId, dto.leaveTypeId);

    /*
     * Recalculate duration.
     *
     * Never trust client supplied days.
     */
    const days = this.calculateLeaveDays(dto.startDate, dto.endDate, dto.durationUnit ?? 'day');

    if (days <= 0) {
      throw new BadRequestException('Invalid leave duration');
    }

    /*
     * Maximum request limit.
     */
    if (days > (type.maxDaysPerRequest ?? Infinity)) {
      throw new BadRequestException('Maximum leave limit exceeded');
    }

    /*
     * Half-day leave type permission.
     */
    if (dto.durationUnit === 'half_day' && type.allowHalfDay !== true) {
      throw new BadRequestException('Half-day leave is not allowed for this leave type');
    }

    /*
     * Check balance.
     */
    await this.checkBalance(userId, dto.leaveTypeId, days);

    /*
     * Persist normalized request.
     */
    await ref.update({
      leaveTypeId: dto.leaveTypeId,

      startDate: dto.startDate,

      endDate: dto.endDate,

      days,

      durationUnit: dto.durationUnit ?? 'day',

      halfDay: dto.durationUnit === 'half_day' ? dto.halfDay : null,

      reason: dto.reason ?? '',

      updatedAt: new Date(),
    });

    return {
      success: true,

      id,

      days,

      durationUnit: dto.durationUnit ?? 'day',

      halfDay: dto.durationUnit === 'half_day' ? dto.halfDay : null,
    };
  }

  // ==================================================
  // CANCEL
  // ==================================================

  async remove(userId: string, id: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const ref = this.db.collection('leaveRequests').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Leave request not found');
    }

    const data = doc.data()!;

    if (data.userId !== userId) {
      throw new BadRequestException('Permission denied');
    }

    /*
     * Approved leave is never physically deleted.
     */
    if (data.status === 'approved') {
      throw new BadRequestException('Approved leave cannot be deleted');
    }

    if (data.status === 'cancelled') {
      throw new BadRequestException('Leave is already cancelled');
    }

    await ref.update({
      status: 'cancelled',

      updatedAt: new Date(),
    });

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // APPROVE
  // ==================================================

  async approve(userId: string, id: string) {
    const approver = await this.getUser(userId);

    const rootId = this.getRootId(approver);

    /*
     * Verify approval permission.
     */
    if (!this.isRoot(approver)) {
      const permissions = await this.getPermissions(userId);

      if (approver.role === 'hr') {
        if (permissions['leave.approve'] !== true) {
          throw new BadRequestException('Permission denied');
        }
      }
    }

    const ref = this.db.collection('leaveRequests').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Leave request not found');
    }

    const data = doc.data()!;

    if (data.status !== 'pending') {
      throw new BadRequestException('Leave is not pending');
    }

    /*
     * Never allow self approval.
     */
    if (data.userId === userId) {
      throw new BadRequestException('You cannot approve your own leave');
    }

    const steps = data.approval ?? [];

    const level = Number(data.currentLevel ?? 0);

    const step = steps[level];

    /*
     * Direct approver OR HR acting
     * on behalf of parent manager.
     */
    if (!this.isLeaveApprover(approver, step)) {
      throw new BadRequestException('You are not authorized to approve this leave');
    }

    /*
     * Record actual approver.
     */
    step.status = 'approved';

    step.approvedBy = userId;

    step.approvedAt = new Date();

    const nextLevel = level + 1;

    /*
     * More approval levels.
     */
    if (nextLevel < steps.length) {
      steps[nextLevel].status = 'pending';

      await ref.update({
        approval: steps,

        currentLevel: nextLevel,

        updatedAt: new Date(),
      });

      return {
        success: true,

        status: 'pending',
      };
    }

    /*
     * Final approval.
     */
    await ref.update({
      approval: steps,

      currentLevel: null,

      status: 'approved',

      approvedAt: new Date(),

      updatedAt: new Date(),
    });

    const type = await this.getLeaveType(rootId, data.leaveTypeId);

    const employee = await this.getUser(data.userId);

    await this.finalizeApprovedLeave(id, employee, data, type);

    this.logger.log(`Leave approved | id=${id} | approver=${userId}`);

    return {
      success: true,

      status: 'approved',
    };
  }

  // ==================================================
  // REJECT
  // ==================================================

  async reject(userId: string, id: string, reason?: string) {
    const approver = await this.getUser(userId);

    const rootId = this.getRootId(approver);

    /*
     * Verify permission.
     */
    if (!this.isRoot(approver)) {
      const permissions = await this.getPermissions(userId);

      const permission = 'leave.approve';

      if (permissions[permission] !== true) {
        throw new BadRequestException('Permission denied');
      }
    }

    const ref = this.db.collection('leaveRequests').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Leave request not found');
    }

    const data = doc.data()!;

    if (data.status !== 'pending') {
      throw new BadRequestException('Leave is not pending');
    }

    /*
     * Never allow self rejection.
     */
    if (data.userId === userId) {
      throw new BadRequestException('You cannot reject your own leave');
    }

    const level = Number(data.currentLevel ?? 0);

    const step = data.approval?.[level];

    /*
     * Direct approver OR HR acting
     * on behalf of parent manager.
     */
    if (!this.isLeaveApprover(approver, step)) {
      throw new BadRequestException('You are not authorized to reject this leave');
    }

    step.status = 'rejected';

    step.rejectedBy = userId;

    step.rejectedAt = new Date();

    await ref.update({
      approval: data.approval,

      currentLevel: null,

      status: 'rejected',

      rejectionReason: reason ?? '',

      updatedAt: new Date(),
    });

    this.logger.log(`Leave rejected | id=${id} | approver=${userId}`);

    return {
      success: true,

      status: 'rejected',
    };
  }

  // ==================================================
  // LEAVE APPROVER
  // ==================================================

  private isLeaveApprover(user: any, step: any): boolean {
    if (!step || step.status !== 'pending') {
      return false;
    }

    /*
     * Direct approver.
     */
    if (step.userId === user.uid) {
      return true;
    }

    /*
     * HR can act on behalf of
     * parent manager.
     */
    if (user.role === 'hr' && user.parentId && user.parentId === step.userId) {
      return true;
    }

    return false;
  }

  // ==================================================
  // LEAVE TYPES
  // ==================================================

  async getTypes(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const snap = await this.db.collection('leaveTypes').where('rootId', '==', rootId).where('active', '==', true).get();

    return {
      types: snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
    };
  }

  // ==================================================
  // CREATE LEAVE TYPE
  // ==================================================

  async createType(userId: string, dto: LeaveTypeDto) {
    const user = await this.getUser(userId);

    const allowed = await this.canManageLeaveTypes(user);

    if (!allowed) {
      throw new BadRequestException('Permission denied');
    }

    const rootId = this.getRootId(user);

    const name = dto.name.trim();

    const code = dto.code.trim().toUpperCase();

    /*
     * Code uniqueness.
     */
    const codeSnap = await this.db
      .collection('leaveTypes')
      .where('rootId', '==', rootId)
      .where('code', '==', code)
      .limit(1)
      .get();

    if (!codeSnap.empty) {
      throw new BadRequestException('Leave type code already exists');
    }

    const ref = await this.db.collection('leaveTypes').add({
      ...dto,

      name,

      code,

      rootId,

      active: true,

      createdAt: new Date(),

      updatedAt: new Date(),
    });

    this.logger.log(`Leave type created | id=${ref.id} | user=${userId}`);

    return {
      success: true,

      id: ref.id,
    };
  }

  // ==================================================
  // DEACTIVATE LEAVE TYPE
  // ==================================================

  async deactivateType(userId: string, id: string) {
    const user = await this.getUser(userId);

    const allowed = await this.canManageLeaveTypes(user);

    if (!allowed) {
      throw new BadRequestException('Permission denied');
    }

    const ref = this.db.collection('leaveTypes').doc(id);

    const doc = await ref.get();

    if (!doc.exists) {
      throw new NotFoundException('Leave type not found');
    }

    const data = doc.data()!;

    if (data.rootId !== this.getRootId(user)) {
      throw new BadRequestException('Permission denied');
    }

    if (data.active !== true) {
      throw new BadRequestException('Leave type is already inactive');
    }

    await ref.update({
      active: false,

      updatedAt: new Date(),
    });

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // REACTIVATE LEAVE TYPE
  // ==================================================

  async reactivateType(userId: string, id: string) {
    const user = await this.getUser(userId);

    const allowed = await this.canManageLeaveTypes(user);

    if (!allowed) {
      throw new BadRequestException('Permission denied');
    }

    const ref = this.db.collection('leaveTypes').doc(id);

    const doc = await ref.get();

    if (!doc.exists) {
      throw new NotFoundException('Leave type not found');
    }

    const data = doc.data()!;

    if (data.rootId !== this.getRootId(user)) {
      throw new BadRequestException('Permission denied');
    }

    if (data.active === true) {
      throw new BadRequestException('Leave type is already active');
    }

    await ref.update({
      active: true,

      updatedAt: new Date(),
    });

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // GET MANAGEABLE LEAVE TYPES
  // ==================================================

  async getManageableTypes(userId: string) {
    const user = await this.getUser(userId);

    const allowed = await this.canManageLeaveTypes(user);

    if (!allowed) {
      throw new BadRequestException('Permission denied');
    }

    const rootId = this.getRootId(user);

    const snap = await this.db.collection('leaveTypes').where('rootId', '==', rootId).get();

    return {
      types: snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
    };
  }

  // ==================================================
  // CAN MANAGE LEAVE TYPES
  // ==================================================

  private async canManageLeaveTypes(user: any): Promise<boolean> {
    if (user.role === 'root_manager') {
      return true;
    }

    if (user.role === 'root_hr') {
      const permissions = await this.getPermissions(user.uid);

      return permissions['leave.type.manage'] === true;
    }

    return false;
  }

  // ==================================================
  // LEAVE TYPE ACCESS
  // ==================================================

  async getTypeAccess(userId: string) {
    const user = await this.getUser(userId);

    /*
     * Root Manager automatically
     * has management access.
     */
    if (user.role === 'root_manager') {
      return {
        canView: true,

        canManage: true,
      };
    }

    /*
     * Root HR requires explicit
     * permission.
     */
    if (user.role === 'root_hr') {
      const permissions = await this.getPermissions(user.uid);

      const allowed = permissions['leave.type.manage'] === true;

      return {
        canView: allowed,

        canManage: allowed,
      };
    }

    return {
      canView: false,

      canManage: false,
    };
  }

  // ==================================================
  // APPROVAL CHAIN
  // ==================================================

  private async buildApprovalChain(user: any, mode: string) {
    /*
     * Auto-approved leave does not
     * require an approval chain.
     */
    if (mode === 'auto') {
      return [];
    }

    const chain: any[] = [];

    let current = user;

    const visited = new Set<string>();

    /*
     * Walk current hierarchy.
     */
    while (!visited.has(current.uid)) {
      visited.add(current.uid);

      let parentId = current.parentId;

      /*
       * Direct child of root.
       */
      if (!parentId) {
        const rootId = this.getRootId(current);

        if (!rootId || rootId === current.uid) {
          break;
        }

        parentId = rootId;
      }

      const parent = await this.getUser(parentId);

      /*
       * Same organization.
       */
      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new BadRequestException('Invalid hierarchy');
      }

      /*
       * HR is not an approval level.
       *
       * Continue upward.
       */
      if (['hr', 'root_hr'].includes(parent.role)) {
        current = parent;

        continue;
      }

      /*
       * Add actual hierarchy parent.
       */
      chain.push({
        level: chain.length,

        userId: parent.uid,

        role: parent.role,

        status: chain.length === 0 ? 'pending' : 'waiting',
      });

      /*
       * Root is final authority.
       */
      if (this.isRoot(parent)) {
        break;
      }

      current = parent;

      /*
       * One-level approval.
       */
      if (mode === 'one_level') {
        break;
      }

      /*
       * Two-level approval.
       */
      if (mode === 'two_level' && chain.length >= 2) {
        break;
      }

      /*
       * Root approval mode.
       */
      if (mode === 'root' && this.isRoot(current)) {
        break;
      }
    }

    /*
     * No approver.
     */
    if (!chain.length) {
      throw new BadRequestException('No valid approver found in current hierarchy');
    }

    /*
     * Validate approval permissions.
     */
    for (const step of chain) {
      const approver = await this.getUser(step.userId);

      /*
       * Root does not require permission.
       */
      if (this.isRoot(approver)) {
        continue;
      }

      const permissions = await this.getPermissions(approver.uid);

      if (permissions['leave.approve'] !== true) {
        throw new BadRequestException(`Approver ${approver.uid} does not have leave approval permission`);
      }
    }

    return chain;
  }

  // ==================================================
  // FINALIZE APPROVED LEAVE
  // ==================================================

  private async finalizeApprovedLeave(leaveId: string, user: any, data: any, type: any) {
    const batch = this.db.batch();

    /*
     * Leave ledger.
     */
    const ledger = this.db.collection('leaveLedger').doc();

    batch.set(ledger, {
      rootId: this.getRootId(user),

      userId: user.uid,

      leaveRequestId: leaveId,

      leaveTypeId: data.leaveTypeId,

      transactionType: 'DEBIT',

      days: data.days,

      /*
       * Persist half-day information
       * for ledger traceability.
       */
      durationUnit: data.durationUnit ?? 'day',

      halfDay: data.durationUnit === 'half_day' ? (data.halfDay ?? null) : null,

      createdAt: new Date(),
    });

    /*
     * Payroll impact.
     */
    const payroll = this.db.collection('payrollAdjustments').doc();

    batch.set(payroll, {
      rootId: this.getRootId(user),

      userId: user.uid,

      sourceType: 'LEAVE',

      sourceId: leaveId,

      leaveTypeId: data.leaveTypeId,

      days: type.isPaid ? 0 : data.days,

      /*
       * Payroll also knows which
       * half was taken.
       */
      durationUnit: data.durationUnit ?? 'day',

      halfDay: data.durationUnit === 'half_day' ? (data.halfDay ?? null) : null,

      adjustmentType: type.deductSalary ? 'DEDUCTION' : 'NONE',

      status: 'pending',

      createdAt: new Date(),
    });

    /*
     * Persist financial records first.
     */
    await batch.commit();

    /*
     * Synchronize approved leave
     * with attendance.
     */
    await this.syncLeaveToAttendance(leaveId, user, data);
  }

  // ==================================================
  // BALANCE
  // ==================================================

  private async checkBalance(userId: string, leaveTypeId: string, days: number) {
    const snap = await this.db
      .collection('leaveBalances')
      .where('userId', '==', userId)
      .where('leaveTypeId', '==', leaveTypeId)
      .limit(1)
      .get();

    /*
     * No balance record means
     * balance management has not
     * been initialized.
     */
    if (snap.empty) {
      return;
    }

    const balance = snap.docs[0].data();

    const remaining = balance.remaining ?? 0;

    if (remaining < days) {
      throw new BadRequestException('Insufficient leave balance');
    }
  }

  // ==================================================
  // LEAVE TYPE
  // ==================================================

  private async getLeaveType(rootId: string, id: string) {
    const doc = await this.db.collection('leaveTypes').doc(id).get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Leave type not found');
    }

    const data = doc.data()!;

    if (data.active !== true) {
      throw new BadRequestException('Leave type is inactive');
    }

    return {
      id: doc.id,

      ...data,
    } as any;
  }

  // ==================================================
  // AUTHORIZATION
  // ==================================================

  private async authorize(user: any, permission: string) {
    /*
     * Root authority.
     */
    if (this.isRoot(user)) {
      return;
    }

    /*
     * HR permissions.
     */
    if (user.role === 'hr') {
      const permissions = await this.getPermissions(user.uid);

      if (permissions[permission] !== true) {
        throw new BadRequestException('Permission denied');
      }

      return;
    }

    /*
     * Field executive has
     * no management authority.
     */
    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    const permissions = await this.getPermissions(user.uid);

    if (permissions[permission] !== true) {
      throw new BadRequestException('Permission denied');
    }

    /*
     * Parent authority cannot
     * be weaker than child.
     */
    await this.verifyAuthorityChain(user, permission);
  }

  // ==================================================
  // AUTHORITY CHAIN
  // ==================================================

  private async verifyAuthorityChain(user: any, permission: string) {
    let current = user;

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      const parent = await this.getUser(current.parentId);

      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new BadRequestException('Invalid hierarchy');
      }

      /*
       * Root ends authority chain.
       */
      if (this.isRoot(parent)) {
        return;
      }

      const permissions = await this.getPermissions(parent.uid);

      if (permissions[permission] !== true) {
        throw new BadRequestException('Parent authority denied');
      }

      current = parent;
    }
  }

  // ==================================================
  // DESCENDANTS
  // ==================================================

  private async getDescendantIds(user: any): Promise<Set<string>> {
    const rootId = this.getRootId(user);

    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const children = new Map<string, any[]>();

    for (const doc of snap.docs) {
      const data = doc.data();

      if (!data.parentId) {
        continue;
      }

      const list = children.get(data.parentId) ?? [];

      list.push({
        uid: doc.id,

        ...data,
      });

      children.set(data.parentId, list);
    }

    const result = new Set<string>();

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      const users = children.get(parentId) ?? [];

      for (const child of users) {
        if (child.rootId !== rootId) {
          continue;
        }

        result.add(child.uid);

        /*
         * HR does not become
         * another hierarchy level.
         */
        if (child.role === 'hr') {
          continue;
        }

        walk(child.uid);
      }
    };

    walk(user.uid);

    return result;
  }

  // ==================================================
  // USER
  // ==================================================

  private async getUser(uid: string) {
    const doc = await this.db.collection('user').doc(uid).get();

    if (!doc.exists) {
      throw new NotFoundException('User not found');
    }

    return {
      uid: doc.id,

      ...doc.data(),
    } as any;
  }

  // ==================================================
  // PERMISSIONS
  // ==================================================

  private async getPermissions(uid: string) {
    const doc = await this.db.collection('user').doc(uid).collection('settings').doc('permissions').get();

    return doc.exists ? (doc.data() ?? {}) : {};
  }

  // ==================================================
  // ROOT
  // ==================================================

  private isRoot(user: any) {
    return ['root', 'admin', 'root_manager', 'root_hr'].includes(user.role);
  }

  private getRootId(user: any): string {
    if (this.isRoot(user)) {
      return user.rootId || user.uid;
    }

    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy');
    }

    return user.rootId;
  }

  // ==================================================
  // CALCULATE LEAVE DAYS
  // ==================================================

  private calculateLeaveDays(startDate: string, endDate: string, durationUnit: string): number {
    const start = new Date(startDate);

    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid leave date');
    }

    /*
     * Normalize calendar dates
     * to UTC.
     */
    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());

    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

    const calendarDays = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;

    if (calendarDays <= 0) {
      throw new BadRequestException('End date cannot be before start date');
    }

    switch (durationUnit) {
      case 'day':
        return calendarDays;

      case 'half_day':
        /*
         * A half-day request represents
         * exactly one half of one day.
         */
        if (calendarDays !== 1) {
          throw new BadRequestException('Half-day leave must be for one day');
        }

        return 0.5;

      case 'hour':
        /*
         * Hourly leave is not yet
         * supported because LeaveDto
         * has no hours field.
         */
        throw new BadRequestException('Hourly leave requires an hour duration');

      default:
        throw new BadRequestException('Invalid leave duration unit');
    }
  }

  // ==================================================
  // VALIDATE
  // ==================================================

  private validate(dto: LeaveDto) {
    if (!dto.leaveTypeId?.trim()) {
      throw new BadRequestException('Leave type is required');
    }

    const start = new Date(dto.startDate);

    const end = new Date(dto.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid leave date');
    }

    if (end < start) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const durationUnit = dto.durationUnit ?? 'day';

    if (!['day', 'half_day', 'hour'].includes(durationUnit)) {
      throw new BadRequestException('Invalid leave duration unit');
    }

    /*
     * Half-day requires
     * first_half/second_half.
     */
    if (durationUnit === 'half_day') {
      if (!dto.halfDay) {
        throw new BadRequestException('Half-day leave must specify first_half or second_half');
      }

      if (!['first_half', 'second_half'].includes(dto.halfDay)) {
        throw new BadRequestException('Invalid half-day selection');
      }
    }

    /*
     * halfDay is not valid for
     * full-day or hourly leave.
     */
    if (durationUnit !== 'half_day' && dto.halfDay) {
      throw new BadRequestException('halfDay is only allowed for half-day leave');
    }
  }

  // ==================================================
  // VALIDATE HALF DAY
  // ==================================================

  private validateHalfDay(dto: LeaveDto) {
    const durationUnit = dto.durationUnit ?? 'day';

    if (durationUnit === 'half_day') {
      if (!['first_half', 'second_half'].includes(dto.halfDay ?? '')) {
        throw new BadRequestException('Half-day leave must specify first_half or second_half');
      }

      const start = new Date(dto.startDate);

      const end = new Date(dto.endDate);

      const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());

      const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

      const calendarDays = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;

      if (calendarDays !== 1) {
        throw new BadRequestException('Half-day leave must be for one day');
      }
    }
  }

  // ==================================================
  // SYNC APPROVED LEAVE TO ATTENDANCE
  // ==================================================

  private async syncLeaveToAttendance(leaveId: string, user: any, data: any) {
    const rootId = this.getRootId(user);

    const start = new Date(data.startDate);

    const end = new Date(data.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid leave dates');
    }

    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());

    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

    const totalDays = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;

    if (totalDays <= 0) {
      throw new BadRequestException('Invalid leave date range');
    }

    const refs: FirebaseFirestore.DocumentReference[] = [];

    const dates: string[] = [];

    for (let index = 0; index < totalDays; index++) {
      const current = new Date(startDay + index * 24 * 60 * 60 * 1000);

      const year = current.getUTCFullYear();

      const month = String(current.getUTCMonth() + 1).padStart(2, '0');

      const day = String(current.getUTCDate()).padStart(2, '0');

      const date = `${year}-${month}-${day}`;

      const dateKey = `${year}${month}${day}`;

      const ref = this.db.collection('attendance').doc(user.uid).collection('records').doc(dateKey);

      refs.push(ref);

      dates.push(date);
    }

    /*
     * Read all affected attendance
     * records before writing.
     */
    const snapshots = await this.db.getAll(...refs);

    const BATCH_SIZE = 450;

    const operations: Array<{
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.DocumentData;
    }> = [];

    snapshots.forEach((snapshot, index) => {
      const existing = snapshot.exists ? (snapshot.data() ?? {}) : {};

      const date = dates[index];

      const isHalfDay = data.durationUnit === 'half_day';

      /*
       * ======================================================
       * FULL-DAY LEAVE
       * ======================================================
       */
      if (!isHalfDay) {
        /*
         * Existing attendance means
         * there is a conflict.
         *
         * Preserve actual attendance.
         */
        if (existing.checkInTime) {
          this.logger.warn(
            `Approved full-day leave overlaps existing attendance | leave=${leaveId} | user=${user.uid} | date=${date}`
          );

          operations.push({
            ref: snapshot.ref,

            data: {
              leaveRequestId: leaveId,

              leaveTypeId: data.leaveTypeId,

              leaveDuration: 'day',

              halfDay: null,

              leaveStatus: 'approved',

              updatedAt: FieldValue.serverTimestamp(),
            },
          });

          return;
        }

        /*
         * No actual attendance.
         *
         * Create normal leave record.
         */
        operations.push({
          ref: snapshot.ref,

          data: {
            staffId: user.uid,

            rootId,

            date: this.localDate(date),

            status: 'leave',

            attendanceType: null,

            workingMinutes: 0,

            leaveMinutes: 0,

            leaveRequestId: leaveId,

            leaveTypeId: data.leaveTypeId,

            leaveDuration: 'day',

            halfDay: null,

            leaveStatus: 'approved',

            createdAt: snapshot.exists
              ? (existing.createdAt ?? FieldValue.serverTimestamp())
              : FieldValue.serverTimestamp(),

            updatedAt: FieldValue.serverTimestamp(),
          },
        });

        return;
      }

      /*
       * ======================================================
       * HALF-DAY LEAVE
       * ======================================================
       */

      const halfDay = data.halfDay;

      /*
       * Defensive backend check.
       */
      if (!['first_half', 'second_half'].includes(halfDay)) {
        throw new BadRequestException('Approved half-day leave is missing a valid halfDay value');
      }

      /*
       * Base half-day attendance
       * information.
       */
      const update: FirebaseFirestore.DocumentData = {
        staffId: user.uid,

        rootId,

        date: this.localDate(date),

        leaveRequestId: leaveId,

        leaveTypeId: data.leaveTypeId,

        leaveDuration: 'half_day',

        halfDay,

        leaveStatus: 'approved',

        /*
         * Half-day = 240 minutes
         * under the current attendance
         * architecture.
         *
         * Actual working minutes may
         * later be updated by attendance
         * processing.
         */
        leaveMinutes: 240,

        updatedAt: FieldValue.serverTimestamp(),
      };

      /*
       * ------------------------------------------------------
       * NO EXISTING ATTENDANCE
       * ------------------------------------------------------
       *
       * Create a leave-based record.
       *
       * We intentionally mark only the
       * corresponding half as leave.
       */
      if (!existing.checkInTime) {
        update.status = 'leave';

        update.attendanceType = 'half_day';

        update.workingMinutes = 0;
      }

      /*
       * ------------------------------------------------------
       * EXISTING ATTENDANCE
       * ------------------------------------------------------
       *
       * Never destroy real attendance.
       *
       * The attendance scheduler can use
       * halfDay to determine which portion
       * of the shift is leave.
       */
      operations.push({
        ref: snapshot.ref,

        data: update,
      });
    });

    /*
     * Write in chunks.
     */
    for (let index = 0; index < operations.length; index += BATCH_SIZE) {
      const chunk = operations.slice(index, index + BATCH_SIZE);

      const batch = this.db.batch();

      for (const operation of chunk) {
        batch.set(operation.ref, operation.data, {
          merge: true,
        });
      }

      await batch.commit();
    }

    this.logger.log(
      `Approved leave synchronized to attendance | leave=${leaveId} | user=${user.uid} | days=${totalDays} | duration=${data.durationUnit ?? 'day'} | halfDay=${data.halfDay ?? 'none'}`
    );
  }

  // ==================================================
  // LOCAL DATE
  // ==================================================

  private localDate(date: string | Date): Date {
    if (date instanceof Date) {
      return date;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date(`${date}T00:00:00+05:30`);
    }

    if (/^\d{8}$/.test(date)) {
      const formatted = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

      return new Date(`${formatted}T00:00:00+05:30`);
    }

    throw new BadRequestException(`Invalid date: ${date}`);
  }
}
