import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../../firebase/firebase.service';
import { StaffDto } from './../dto/staff.dto';

type Role = 'manager' | 'hr' | 'field_executive';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET CHILDREN
  // ==================================================

  async getAll(userId: string, role: Role) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    // Load complete hierarchy once
    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    // userId -> children
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

    // Build complete recursive descendants
    const descendants: any[] = [];

    const walk = (parentId: string) => {
      for (const child of byParent.get(parentId) || []) {
        descendants.push(child);

        walk(child.id);
      }
    };

    walk(userId);

    // Fast parent lookup
    const userMap = new Map(users.map((item) => [item.id, item]));

    // Filter requested role and attach direct parent
    const result = descendants
      .filter((item) => item.role === role)
      .map((item) => {
        const parent = userMap.get(item.parentId);

        return {
          id: item.id,

          fullName: item.fullName ?? '',

          email: item.email ?? '',

          mobile: item.mobile ?? '',

          isActive: item.isActive !== false,

          role: item.role ?? '',

          parentId: item.parentId ?? '',

          shiftId: item.shiftId ?? '',

          parentName: parent?.fullName ?? 'Root',
        };
      });

    return {
      users: result,
    };
  }

  // ==================================================
  // CREATE
  // ==================================================

  async create(userId: string, role: Role, dto: StaffDto) {
    this.logger.log(`Create | user=${userId} role=${role} parent=${dto.parentId || userId} email=${dto.email}`);

    if ((role === 'manager' || role === 'hr') && !dto.shiftId) {
      throw new BadRequestException('Shift is required for manager and HR');
    }

    if (role === 'manager' || role === 'hr') {
      const shift = await this.db.collection('shifts').doc(dto.shiftId!).get();

      if (!shift.exists) {
        throw new BadRequestException('Selected shift not found');
      }
    }

    const requester = await this.getUser(userId);

    const selectedParentId = dto.parentId || userId;

    const parent = await this.getUser(selectedParentId);

    await this.verifyParentAccess(userId, selectedParentId);

    await this.authorize(selectedParentId, role, 'create');

    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const rootId = this.getRootId(requester);

    const parentRootId = this.getRootId(parent);

    if (parentRootId !== rootId) {
      this.logger.error(
        `Invalid hierarchy | create | requester=${userId} root=${rootId} parent=${selectedParentId} parentRoot=${parentRootId}`
      );

      throw new BadRequestException('Invalid hierarchy');
    }

    const authUser = await this.firebase.auth.createUser({
      email: dto.email,
      password: dto.password,
    });

    try {
      await this.db
        .collection('user')
        .doc(authUser.uid)
        .set({
          uid: authUser.uid,
          rootId,
          parentId: selectedParentId,
          role,
          fullName: dto.fullName,
          email: dto.email,
          mobile: dto.mobile ?? '',
          isActive: dto.isActive !== false,

          ...(role === 'manager' || role === 'hr'
            ? {
                shiftId: dto.shiftId,
              }
            : {}),

          createdAt: new Date(),
          updatedAt: new Date(),
        });

      await this.createPermissions(authUser.uid, role, selectedParentId);

      this.logger.log(
        `Created | id=${authUser.uid} role=${role} parent=${selectedParentId} shift=${dto.shiftId ?? 'team-based'}`
      );

      return {
        success: true,
        id: authUser.uid,
      };
    } catch (error) {
      this.logger.error(`Create failed | email=${dto.email}`, error instanceof Error ? error.stack : String(error));

      await this.firebase.auth.deleteUser(authUser.uid);

      throw error;
    }
  }

  // ==================================================
  // VERIFY PARENT ACCESS
  // ==================================================

  private async verifyParentAccess(userId: string, parentId: string) {
    if (userId === parentId) {
      return;
    }

    const user = await this.getUser(userId);

    const parent = await this.getUser(parentId);

    const userRoot = this.getRootId(user);

    const parentRoot = this.getRootId(parent);

    if (userRoot !== parentRoot) {
      this.logger.warn(
        `Invalid parent hierarchy | user=${userId} parent=${parentId} userRoot=${userRoot} parentRoot=${parentRoot}`
      );

      throw new NotFoundException('Invalid parent');
    }

    /*
     * Root users can manage
     * any user inside their hierarchy.
     */
    if (user.role === 'root_manager' || user.role === 'root_hr' || user.role === 'root' || user.role === 'admin') {
      return;
    }

    let current = parent;

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      if (current.parentId === userId) {
        return;
      }

      current = await this.getUser(current.parentId);
    }

    this.logger.warn(`Parent access denied | user=${userId} parent=${parentId}`);

    throw new BadRequestException('You cannot manage this parent');
  }

  // ==================================================
  // UPDATE
  // ==================================================

  async update(parentId: string, id: string, dto: StaffDto) {
    const target = await this.getUser(id);

    /*
     * Target can be any descendant
     * inside the requester's hierarchy.
     */
    await this.verifyDescendant(parentId, id);

    await this.authorize(parentId, target.role, 'edit');

    const updateData: Record<string, unknown> = {
      fullName: dto.fullName,

      mobile: dto.mobile ?? '',

      isActive: dto.isActive !== false,

      updatedAt: new Date(),
    };

    /*
     * Manager and HR must have
     * a direct shiftId.
     */
    if (target.role === 'manager' || target.role === 'hr') {
      if (!dto.shiftId) {
        throw new BadRequestException('Shift is required for manager and HR');
      }

      /*
       * Make sure the selected shift
       * actually exists.
       */
      const shift = await this.db.collection('shifts').doc(dto.shiftId).get();

      if (!shift.exists) {
        throw new BadRequestException('Selected shift not found');
      }

      updateData.shiftId = dto.shiftId;
    }

    await this.db.collection('user').doc(id).update(updateData);

    /*
     * Password is handled through Firebase Auth,
     * not Firestore.
     */
    if (dto.password) {
      await this.firebase.auth.updateUser(id, {
        password: dto.password,
      });
    }

    this.logger.log(
      `Updated | target=${id} | requester=${parentId} | role=${target.role} | shift=${dto.shiftId ?? 'team-based'}`
    );

    return {
      success: true,
      id,
    };
  }

  // ==================================================
  // DELETE
  // ==================================================

  async remove(parentId: string, id: string) {
    const parent = await this.getUser(parentId);

    const target = await this.getUser(id);

    const rootId = this.getRootId(parent);

    if (target.parentId !== parentId || target.rootId !== rootId) {
      this.logger.warn(`Delete target not found | parent=${parentId} target=${id}`);

      throw new NotFoundException('User not found');
    }

    await this.authorize(parentId, target.role, 'delete');

    await Promise.all([this.db.collection('user').doc(id).delete(), this.firebase.auth.deleteUser(id)]);

    this.logger.log(`Deleted | id=${id} parent=${parentId}`);

    return {
      success: true,
      id,
    };
  }

  // ==================================================
  // GET PERMISSIONS
  // ==================================================

  async getPermissions(parentId: string, id: string) {
    const target = await this.getUser(id);

    await this.verifyDescendant(parentId, id);

    await this.authorize(parentId, target.role, 'manage_permissions');

    return {
      id,
      role: target.role,
      permissions: await this.permissions(id),
    };
  }

  // ==================================================
  // UPDATE PERMISSIONS
  // ==================================================

  async updatePermissions(parentId: string, id: string, permissions: Record<string, boolean>) {
    const target = await this.getUser(id);

    await this.verifyDescendant(parentId, id);

    await this.authorize(parentId, target.role, 'manage_permissions');

    const parentPermissions = await this.permissions(parentId);

    for (const [key, value] of Object.entries(permissions)) {
      if (value === true && parentPermissions[key] === false) {
        this.logger.warn(`Permission denied | parent=${parentId} target=${id} key=${key}`);

        throw new BadRequestException(`Parent does not allow ${key}`);
      }
    }

    await this.db
      .collection('user')
      .doc(id)
      .collection('settings')
      .doc('permissions')
      .set(permissions, { merge: true });

    this.logger.log(`Permissions updated | parent=${parentId} target=${id}`);

    return {
      success: true,
    };
  }

  // ==================================================
  // VERIFY DESCENDANT
  // ==================================================

  private async verifyDescendant(parentId: string, targetId: string) {
    if (parentId === targetId) {
      throw new BadRequestException('Cannot manage yourself');
    }

    const parent = await this.getUser(parentId);

    const target = await this.getUser(targetId);

    if (this.getRootId(parent) !== this.getRootId(target)) {
      this.logger.warn(`Invalid descendant hierarchy | parent=${parentId} target=${targetId}`);

      throw new NotFoundException('User not found');
    }

    let current = target;

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      if (current.parentId === parentId) {
        return;
      }

      current = await this.getUser(current.parentId);
    }

    this.logger.warn(`Target is not descendant | parent=${parentId} target=${targetId}`);

    throw new NotFoundException('User not found');
  }

  // ==================================================
  // AUTHORIZATION
  // ==================================================

  private async authorize(userId: string, targetRole: Role, action: string) {
    const user = await this.getUser(userId);

    /*
     * Root has complete authority.
     */
    if (user.role === 'root_manager' || user.role === 'root_hr' || user.role === 'root' || user.role === 'admin') {
      return;
    }

    /*
     * HR can only manage HR.
     */
    if (user.role === 'hr' && targetRole !== 'hr') {
      this.logger.warn(`HR role restriction | user=${userId} targetRole=${targetRole} action=${action}`);

      throw new BadRequestException('HR can only manage HR');
    }

    /*
     * Executive cannot manage anyone.
     */
    if (user.role === 'field_executive') {
      this.logger.warn(`Executive management denied | user=${userId} action=${action}`);

      throw new BadRequestException('Executive has no management permission');
    }

    const permissions = await this.permissions(userId);

    const key = `${targetRole}.${action}`;

    if (permissions[key] !== true) {
      this.logger.warn(`Permission denied | user=${userId} key=${key}`);

      throw new BadRequestException('Permission denied');
    }

    await this.verifyAuthorityChain(userId, targetRole, action);
  }

  // ==================================================
  // AUTHORITY CHAIN
  // ==================================================

  private async verifyAuthorityChain(userId: string, targetRole: Role, action: string) {
    let current = await this.getUser(userId);

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      const parent = await this.getUser(current.parentId);

      const currentRoot = this.getRootId(current);

      const parentRoot = this.getRootId(parent);

      if (parentRoot !== currentRoot) {
        this.logger.error(
          `Invalid hierarchy | method=verifyAuthorityChain | user=${userId} current=${current.uid} currentRoot=${currentRoot} parent=${parent.uid} parentRoot=${parentRoot} targetRole=${targetRole} action=${action}`
        );

        throw new BadRequestException('Invalid hierarchy');
      }

      /*
       * Root bypass.
       */
      if (
        parent.role !== 'root_manager' &&
        parent.role !== 'root_hr' &&
        parent.role !== 'root' &&
        parent.role !== 'admin'
      ) {
        const parentPermissions = await this.permissions(parent.uid);

        const key = `${targetRole}.${action}`;

        if (parentPermissions[key] !== true) {
          this.logger.warn(`Parent authority denied | parent=${parent.uid} key=${key}`);

          throw new BadRequestException('Parent authority denied');
        }
      }

      current = parent;
    }
  }

  // ==================================================
  // CREATE DEFAULT PERMISSIONS
  // ==================================================

  private async createPermissions(uid: string, role: Role, parentId: string) {
    const parentPermissions = await this.permissions(parentId);

    let permissions: Record<string, boolean>;

    if (role === 'manager') {
      permissions = {
        // ==================================================
        // MANAGERS
        // ==================================================

        'manager.create': true,
        'manager.edit': true,
        // 'manager.delete': false,
        // 'manager.manage_permissions': true,

        // ==================================================
        // HR
        // ==================================================

        'hr.create': true,
        'hr.edit': true,
        // 'hr.delete': false,
        'hr.manage_permissions': true,

        // ==================================================
        // FIELD EXECUTIVES
        // ==================================================

        'field_executive.create': true,
        'field_executive.edit': true,
        // 'field_executive.delete': true,

        // ==================================================
        // TEAMS
        // ==================================================

        'team.create': true,
        'team.edit': true,
        'team.delete': false,

        // ==================================================
        // ATTENDANCE
        // ==================================================

        'attendance.view': true,
        'attendance.manage': true,

        // ==================================================
        // TASK
        // ==================================================

        'task.create': true,
        'task.edit': true,
        'task.delete': false,

        // ==================================================
        // LEAVE
        // ==================================================

        'leave.approve': false,
        'leave.view': false,
        // ==================================================
        // TRACKING
        // ==================================================

        'tracking.view': true,
      };
    } else if (role === 'hr') {
      permissions = {
        // ==================================================
        // MANAGERS
        // ==================================================

        'manager.create': false,
        'manager.edit': false,
        'manager.delete': false,
        'manager.manage_permissions': false,

        // ==================================================
        // HR
        // ==================================================

        'hr.create': false,
        'hr.edit': false,
        'hr.delete': false,
        'hr.manage_permissions': false,

        // ==================================================
        // FIELD EXECUTIVES
        // ==================================================

        'field_executive.create': false,
        'field_executive.edit': false,
        'field_executive.delete': false,

        // ==================================================
        // TEAMS
        // ==================================================

        'team.create': false,
        'team.edit': false,
        'team.delete': false,

        // ==================================================
        // ATTENDANCE
        // ==================================================

        'attendance.view': true,
        'attendance.manage': true,

        // ==================================================
        // TRACKING
        // ==================================================

        'tracking.view': true,
      };
    } else {
      permissions = {};
    }

    /*
     * Never give child more authority
     * than parent.
     */
    for (const key of Object.keys(permissions)) {
      if (parentPermissions[key] === false) {
        permissions[key] = false;
      }
    }

    await this.db.collection('user').doc(uid).collection('settings').doc('permissions').set(permissions);
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
  // GET PARENTS
  // ==================================================

  async getParents(userId: string, targetRole: Role) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    const children = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) continue;

      if (!children.has(item.parentId)) {
        children.set(item.parentId, []);
      }

      children.get(item.parentId)!.push(item);
    }

    const allowed: any[] = [];

    /*
     * Current user is always the
     * default/direct parent.
     */
    if (user.role === 'root_manager' || user.role === 'root' || user.role === 'admin' || user.role === 'manager') {
      allowed.push(user);
    }

    /*
     * Add descendant managers.
     */
    const walk = (parentId: string) => {
      for (const child of children.get(parentId) || []) {
        if (child.role === 'manager') {
          allowed.push(child);
        }

        walk(child.id);
      }
    };

    walk(userId);

    /*
     * HR can only be created under
     * a manager/root manager.
     */
    const filtered =
      targetRole === 'hr'
        ? allowed.filter(
            (item) =>
              item.role === 'manager' || item.role === 'root_manager' || item.role === 'root' || item.role === 'admin'
          )
        : allowed.filter(
            (item) =>
              item.role === 'manager' || item.role === 'root_manager' || item.role === 'root' || item.role === 'admin'
          );

    return {
      users: filtered.map((item) => ({
        id: item.id,
        fullName: item.fullName ?? '',
        role: item.role ?? '',
        parentId: item.parentId ?? '',
      })),
    };
  }

  private getRootId(user: any): string {
    if (user.role === 'root_manager' || user.role === 'root_hr' || user.role === 'root' || user.role === 'admin') {
      return user.uid;
    }

    if (!user.rootId) {
      this.logger.error(`Missing rootId | uid=${user.uid} role=${user.role} parent=${user.parentId}`);

      throw new BadRequestException('Invalid hierarchy');
    }

    return user.rootId;
  }

  // ==================================================
  // PERMISSIONS
  // ==================================================

  private async permissions(uid: string) {
    const doc = await this.db.collection('user').doc(uid).collection('settings').doc('permissions').get();

    return doc.exists ? (doc.data() ?? {}) : {};
  }

  // ==================================================
  // PICK
  // ==================================================

  private pick(data: any) {
    return {
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      mobile: data.mobile ?? '',
      isActive: data.isActive !== false,
      role: data.role ?? '',
      parentId: data.parentId ?? '',
    };
  }
}
