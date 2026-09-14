import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../../firebase/firebase.service';
import { StaffDto } from './../dto/staff.dto';

type Role = 'manager' | 'hr' | 'field_executive';

type PermissionMap = Record<string, boolean>;

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // CONSTANTS
  // ==================================================

  private readonly ROOT_ROLES = ['root_manager', 'root_hr', 'root', 'admin'];

  private readonly HR_MANAGEABLE_ROLES = ['hr', 'field_executive'];

  // ==================================================
  // GET CHILDREN / STAFF
  // ==================================================

  // ==================================================
  // GET STAFF
  // ==================================================

  async getAll(userId: string, role: Role) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * --------------------------------------------------
     * LOAD ORGANIZATION
     * --------------------------------------------------
     *
     * All non-root users belong to the organization
     * through rootId.
     */
    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    /*
     * --------------------------------------------------
     * ROOT USERS
     * --------------------------------------------------
     *
     * Root Manager / Root HR / legacy root/admin
     * can see the complete organization.
     *
     * Do NOT try to find the root user inside the
     * organization query and do NOT use it as a
     * hierarchy scope root.
     */
    if (this.isRoot(user)) {
      const result = users
        .filter((item) => item.role === role)
        .map((item) => {
          const parent = users.find((candidate) => candidate.id === item.parentId);

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

    /*
     * --------------------------------------------------
     * BUILD LOOKUPS
     * --------------------------------------------------
     */

    const userMap = new Map<string, any>();

    const byParent = new Map<string, any[]>();

    for (const item of users) {
      userMap.set(item.id, item);

      if (!item.parentId) {
        continue;
      }

      const children = byParent.get(item.parentId) ?? [];

      children.push(item);

      byParent.set(item.parentId, children);
    }

    /*
     * --------------------------------------------------
     * DETERMINE EFFECTIVE SCOPE
     * --------------------------------------------------
     *
     * Manager:
     *
     *     Manager
     *        ↓
     *     descendants
     *
     * HR:
     *
     *     Owning Manager
     *        ↓
     *     complete manager hierarchy
     *
     * This allows HR to see:
     *
     *     - executives under its manager
     *     - executives under child managers
     *     - HR users in the same hierarchy
     *     - descendants below those users
     */
    const scopeRootId = await this.getEffectiveScopeRootId(user);

    /*
     * --------------------------------------------------
     * FIND SCOPE ROOT
     * --------------------------------------------------
     */

    const scopeRoot = userMap.get(scopeRootId);

    if (!scopeRoot) {
      this.logger.error(
        `Invalid hierarchy | method=getAll | user=${userId} scopeRootId=${scopeRootId} rootId=${rootId}`
      );

      throw new BadRequestException('Invalid hierarchy');
    }

    /*
     * --------------------------------------------------
     * BUILD DESCENDANTS
     * --------------------------------------------------
     */

    const descendants: any[] = [];

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      const children = byParent.get(parentId) ?? [];

      for (const child of children) {
        descendants.push(child);

        walk(child.id);
      }
    };

    walk(scopeRootId);

    /*
     * Include scope root.
     */
    const scopedUsers = [scopeRoot, ...descendants];

    /*
     * Remove duplicates.
     */
    const uniqueUsers = Array.from(new Map(scopedUsers.map((item) => [item.id, item])).values());

    /*
     * --------------------------------------------------
     * FILTER REQUESTED ROLE
     * --------------------------------------------------
     */

    const result = uniqueUsers
      .filter((item) => item.id !== user.uid && item.role === role)
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

    /*
     * Manager and HR require a direct shift.
     */
    if ((role === 'manager' || role === 'hr') && !dto.shiftId) {
      throw new BadRequestException('Shift is required for manager and HR');
    }

    /*
     * Validate shift.
     */
    if (role === 'manager' || role === 'hr') {
      const shift = await this.db.collection('shifts').doc(dto.shiftId!).get();

      if (!shift.exists) {
        throw new BadRequestException('Selected shift not found');
      }
    }

    const requester = await this.getUser(userId);

    /*
     * If no parent is supplied, current user
     * becomes the parent.
     */
    const rootId = this.getRootId(requester);
    const selectedParentId = this.isRoot(requester) ? rootId : dto.parentId || userId;

    const parent = await this.getUser(selectedParentId);

    /*
     * Make sure requester is allowed to use
     * the selected parent.
     */
    await this.verifyParentAccess(userId, selectedParentId);

    /*
     * IMPORTANT:
     *
     * Authorization is checked against the
     * selected parent because the parent must
     * have authority to create the target role.
     */
    await this.authorize(selectedParentId, role, 'create');

    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const parentRootId = this.getRootId(parent);

    if (parentRootId !== rootId) {
      this.logger.error(
        `Invalid hierarchy | create | requester=${userId} root=${rootId} parent=${selectedParentId} parentRoot=${parentRootId}`
      );

      throw new BadRequestException('Invalid hierarchy');
    }

    /*
     * HR-specific protection.
     *
     * HR may never create managers.
     */
    if (requester.role === 'hr' && role === 'manager') {
      throw new BadRequestException('HR cannot create managers');
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

      /*
       * Child permissions can never exceed
       * parent permissions.
       */
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
    /*
     * Creating directly under yourself is allowed
     * when authorization permits it.
     */
    if (userId === parentId) {
      return;
    }

    const user = await this.getUser(userId);

    const parent = await this.getUser(parentId);

    const userRoot = this.getRootId(user);

    const parentRoot = this.getRootId(parent);

    if (userRoot !== parentRoot) {
      throw new NotFoundException('Invalid parent');
    }

    /*
     * Root users can manage any user inside
     * their organization.
     */
    if (this.isRoot(user)) {
      return;
    }

    /*
     * HR may select users only within its
     * effective manager hierarchy.
     */
    if (user.role === 'hr') {
      const scopeRootId = await this.getEffectiveScopeRootId(user);

      const allowed = await this.isDescendantOrSelf(scopeRootId, parentId);

      if (!allowed) {
        throw new BadRequestException('You cannot manage this parent');
      }

      /*
       * HR can never use a manager as a parent
       * for creating another manager.
       *
       * Normal role authorization will still
       * determine whether HR can create HR or
       * executives.
       */
      return;
    }

    /*
     * Manager hierarchy.
     */
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
    const requester = await this.getUser(parentId);

    const target = await this.getUser(id);

    /*
     * HR can manage HR / executives inside
     * its effective manager scope.
     *
     * Managers continue using their normal
     * descendant hierarchy.
     */
    await this.verifyManageableTarget(requester, target);

    await this.authorize(parentId, target.role, 'edit');

    const updateData: Record<string, unknown> = {
      fullName: dto.fullName,

      mobile: dto.mobile ?? '',

      isActive: dto.isActive !== false,

      updatedAt: new Date(),
    };

    /*
     * Manager and HR must have a direct shift.
     */
    if (target.role === 'manager' || target.role === 'hr') {
      if (!dto.shiftId) {
        throw new BadRequestException('Shift is required for manager and HR');
      }

      const shift = await this.db.collection('shifts').doc(dto.shiftId).get();

      if (!shift.exists) {
        throw new BadRequestException('Selected shift not found');
      }

      updateData.shiftId = dto.shiftId;
    }

    await this.db.collection('user').doc(id).update(updateData);

    /*
     * Password is handled through Firebase Auth.
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

    /*
     * HR cannot delete managers.
     */
    if (parent.role === 'hr' && target.role === 'manager') {
      throw new BadRequestException('HR cannot delete managers');
    }

    await this.verifyManageableTarget(parent, target);

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
    const parent = await this.getUser(parentId);

    const target = await this.getUser(id);

    await this.verifyManageableTarget(parent, target);

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

  async updatePermissions(parentId: string, id: string, permissions: PermissionMap) {
    const parent = await this.getUser(parentId);

    const target = await this.getUser(id);

    /*
     * HR must never be allowed to manage
     * permissions.
     */
    if (parent.role === 'hr') {
      throw new BadRequestException('HR cannot manage permissions');
    }

    await this.verifyManageableTarget(parent, target);

    await this.authorize(parentId, target.role, 'manage_permissions');

    const parentPermissions = await this.permissions(parentId);

    /*
     * Never allow a child to receive
     * authority that the parent does not have.
     */
    for (const [key, value] of Object.entries(permissions)) {
      if (value === true && parentPermissions[key] === false) {
        this.logger.warn(`Permission denied | parent=${parentId} target=${id} key=${key}`);

        throw new BadRequestException(`Parent does not allow ${key}`);
      }
    }

    /*
     * Explicitly protect HR from receiving
     * permission-management authority.
     */
    if (target.role === 'hr') {
      permissions['hr.manage_permissions'] = false;

      permissions['manager.manage_permissions'] = false;
    }

    await this.db.collection('user').doc(id).collection('settings').doc('permissions').set(permissions, {
      merge: true,
    });

    this.logger.log(`Permissions updated | parent=${parentId} target=${id}`);

    return {
      success: true,
    };
  }

  // ==================================================
  // VERIFY MANAGEABLE TARGET
  // ==================================================

  private async verifyManageableTarget(requester: any, target: any) {
    if (requester.uid === target.uid) {
      throw new BadRequestException('Cannot manage yourself');
    }

    if (this.getRootId(requester) !== this.getRootId(target)) {
      throw new NotFoundException('User not found');
    }

    /*
     * Root has organization-wide authority.
     */
    if (this.isRoot(requester)) {
      return;
    }

    /*
     * --------------------------------------------------
     * HR SCOPE
     * --------------------------------------------------
     *
     * HR operates inside the manager branch
     * that owns the HR.
     *
     * Example:
     *
     * Manager A
     * ├── HR A
     * ├── HR B
     * ├── Executive A
     * └── Manager B
     *     └── Executive B
     *
     * HR A can potentially manage:
     *
     * HR B
     * Executive A
     * Executive B
     *
     * depending on permissions.
     *
     * Manager A / Manager B themselves are never
     * manageable by HR.
     */
    if (requester.role === 'hr') {
      if (!this.HR_MANAGEABLE_ROLES.includes(target.role)) {
        throw new BadRequestException('HR cannot manage this role');
      }

      const scopeRootId = await this.getEffectiveScopeRootId(requester);

      const allowed = await this.isDescendantOrSelf(scopeRootId, target.uid);

      if (!allowed) {
        throw new NotFoundException('User not found');
      }

      return;
    }

    /*
     * --------------------------------------------------
     * MANAGER SCOPE
     * --------------------------------------------------
     */

    await this.verifyDescendant(requester.uid, target.uid);
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
    if (this.isRoot(user)) {
      return;
    }

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR can only operate on:
     *
     * - HR
     * - Field Executives
     *
     * and only when the appropriate permission
     * is explicitly enabled.
     */
    if (user.role === 'hr') {
      if (!this.HR_MANAGEABLE_ROLES.includes(targetRole)) {
        throw new BadRequestException('HR cannot manage this role');
      }

      const permissions = await this.permissions(userId);

      const key = `${targetRole}.${action}`;

      if (permissions[key] !== true) {
        this.logger.warn(`HR permission denied | user=${userId} key=${key}`);

        throw new BadRequestException('Permission denied');
      }

      /*
       * Verify every manager above the HR
       * still authorizes the same operation.
       */
      await this.verifyAuthorityChain(userId, targetRole, action);

      return;
    }

    /*
     * Executive cannot manage anyone.
     */
    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    /*
     * Normal manager permission.
     */
    const permissions = await this.permissions(userId);

    const key = `${targetRole}.${action}`;

    if (permissions[key] !== true) {
      this.logger.warn(`Permission denied | user=${userId} key=${key}`);

      throw new BadRequestException('Permission denied');
    }

    /*
     * Parent authority must also exist.
     */
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
       * Root ends the authority chain.
       */
      if (this.isRoot(parent)) {
        return;
      }

      const parentPermissions = await this.permissions(parent.uid);

      const key = `${targetRole}.${action}`;

      if (parentPermissions[key] !== true) {
        this.logger.warn(`Parent authority denied | parent=${parent.uid} key=${key}`);

        throw new BadRequestException('Parent authority denied');
      }

      current = parent;
    }
  }

  // ==================================================
  // CREATE DEFAULT PERMISSIONS
  // ==================================================

  private async createPermissions(uid: string, role: Role, parentId: string) {
    const parentPermissions = await this.permissions(parentId);

    let permissions: PermissionMap;

    /*
     * --------------------------------------------------
     * MANAGER
     * --------------------------------------------------
     */

    if (role === 'manager') {
      permissions = {
        // ==================================================
        // MANAGERS
        // ==================================================

        'manager.create': true,
        'manager.edit': true,
        // 'manager.delete': false,
        'manager.manage_permissions': true,

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

        'field_executive.view': true,
        'field_executive.create': true,
        'field_executive.edit': true,
        // 'field_executive.delete': false,

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

        'task.view': true,
        'task.create': true,
        'task.edit': true,
        'task.delete': false,

        // ==================================================
        // LEAVE
        // ==================================================

        'leave.view': false,
        'leave.approve': false,

        // ==================================================
        // TRACKING
        // ==================================================

        'tracking.view': true,
      };
    }

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR starts with useful read access,
     * but the manager remains the authority.
     *
     * The parent permission filter below
     * prevents escalation.
     */
    else if (role === 'hr') {
      permissions = {
        // ==================================================
        // FIELD EXECUTIVES
        // ==================================================

        'field_executive.view': false,
        'field_executive.create': false,
        'field_executive.edit': false,
        // 'field_executive.delete': false,

        // ==================================================
        // TEAMS
        // ==================================================

        'team.create': false,
        'team.edit': false,
        'team.delete': false,

        // ==================================================
        // ATTENDANCE
        // ==================================================

        'attendance.view': false,
        'attendance.manage': false,

        // ==================================================
        // TASK
        // ==================================================
        //
        // HR can ONLY VIEW tasks.
        //

        'task.view': false,
        'task.create': false,
        'task.edit': false,
        'task.delete': false,

        // ==================================================
        // LEAVE
        // ==================================================

        'leave.view': false,
        'leave.approve': false,

        // ==================================================
        // TRACKING
        // ==================================================

        'tracking.view': false,
      };
    }

    /*
     * Field executives do not receive
     * management permissions here.
     */
    else {
      permissions = {};
    }

    /*
     * --------------------------------------------------
     * PARENT AUTHORITY LIMIT
     * --------------------------------------------------
     *
     * A child can never receive a permission
     * that its parent does not possess.
     */
    for (const key of Object.keys(permissions)) {
      if (parentPermissions[key] === false) {
        permissions[key] = false;
      }
    }

    /*
     * HR can never manage permissions.
     */
    if (role === 'hr') {
      permissions['hr.manage_permissions'] = false;

      permissions['manager.manage_permissions'] = false;
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

  // ==================================================
  // GET PARENTS
  // ==================================================

  async getParents(userId: string, targetRole: Role) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * --------------------------------------------------
     * LOAD ORGANIZATION
     * --------------------------------------------------
     *
     * rootId queries contain descendants.
     * The root manager itself may not have a rootId
     * field, so load it separately.
     */

    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    /*
     * --------------------------------------------------
     * ALWAYS ADD ROOT USER
     * --------------------------------------------------
     */

    const rootDoc = await this.db.collection('user').doc(rootId).get();

    if (rootDoc.exists) {
      const rootUser = {
        id: rootDoc.id,
        ...rootDoc.data(),
      };

      const alreadyExists = users.some((item) => item.id === rootUser.id);

      if (!alreadyExists) {
        users.push(rootUser);
      }
    }

    /*
     * --------------------------------------------------
     * USER MAP
     * --------------------------------------------------
     */

    const userMap = new Map<string, any>();

    for (const item of users) {
      userMap.set(item.id, item);
    }

    /*
     * --------------------------------------------------
     * BUILD CHILDREN
     * --------------------------------------------------
     */

    const children = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      const list = children.get(item.parentId) ?? [];

      list.push(item);

      children.set(item.parentId, list);
    }

    /*
     * --------------------------------------------------
     * ALLOWED PARENTS
     * --------------------------------------------------
     */

    const allowed = new Map<string, any>();

    const addParent = (item: any) => {
      const id = item?.id || item?.uid;

      if (!id) {
        return;
      }

      const role = String(item.role || '').toLowerCase();

      if (role === 'manager' || role === 'root_manager' || role === 'root' || role === 'admin') {
        allowed.set(id, {
          ...item,
          id,
          uid: item.uid || id,
        });
      }
    };

    const currentRole = String(user.role || '').toLowerCase();
    this.logger.log(
      `getParents | userId=${userId} userUid=${user.uid} role=${user.role} currentRole=${currentRole} rootId=${rootId}`
    );

    /*
     * --------------------------------------------------
     * ROOT MANAGER
     * --------------------------------------------------
     *
     * Root Manager can select:
     *
     *   Root Manager
     *   All managers in organization
     */

    if (currentRole === 'root_manager' || currentRole === 'root' || currentRole === 'admin') {
      /*
       * IMPORTANT:
       * Explicitly add the logged-in root user.
       */
      addParent(user);

      /*
       * Add every manager in the organization.
       */
      for (const item of users) {
        addParent(item);
      }
    }

    /*
     * --------------------------------------------------
     * MANAGER
     * --------------------------------------------------
     *
     * Manager can select:
     *
     *   itself
     *   descendant managers
     */
    else if (currentRole === 'manager') {
      /*
       * Current manager is always a valid
       * parent for newly created HR.
       */

      addParent(user);

      const visited = new Set<string>();

      const walk = (parentId: string) => {
        if (visited.has(parentId)) {
          return;
        }

        visited.add(parentId);

        for (const child of children.get(parentId) ?? []) {
          if (String(child.role || '').toLowerCase() === 'manager') {
            addParent(child);
          }

          walk(child.id);
        }
      };

      walk(user.uid);
    }

    /*
     * --------------------------------------------------
     * OTHER ROLES
     * --------------------------------------------------
     *
     * HR itself should not be able to create
     * another HR unless explicitly allowed by
     * the authorization layer.
     *
     * Do not expose arbitrary parents here.
     */

    /*
     * --------------------------------------------------
     * RESULT
     * --------------------------------------------------
     */

    const result = Array.from(allowed.values()).map((item) => ({
      id: item.id,

      uid: item.id,

      fullName: item.fullName ?? '',

      role: item.role ?? '',

      parentId: item.parentId ?? '',
    }));

    /*
     * --------------------------------------------------
     * DEFAULT PARENT
     * --------------------------------------------------
     *
     * Root Manager:
     *   logged-in Root Manager
     *
     * Manager:
     *   logged-in Manager
     */

    let defaultParentId = '';

    if (currentRole === 'root_manager' || currentRole === 'root' || currentRole === 'admin') {
      defaultParentId = user.uid;
    }

    if (currentRole === 'manager') {
      defaultParentId = user.uid;
    }

    /*
     * Safety fallback.
     */
    if (!defaultParentId && result.length === 1) {
      defaultParentId = result[0].id;
    }

    return {
      users: result,

      defaultParentId,
    };
  }

  // ==================================================
  // EFFECTIVE HR SCOPE
  // ==================================================

  private async getEffectiveScopeRootId(user: any): Promise<string> {
    /*
     * Only HR needs the special scope.
     */
    if (user.role !== 'hr') {
      return user.uid;
    }

    let current = user;

    const visited = new Set<string>();

    /*
     * Walk upward until the first manager
     * is found.
     *
     * Example:
     *
     * Manager A
     *    ↓
     * HR A
     *    ↓
     * HR B
     *
     * HR B's effective scope root is
     * Manager A.
     */
    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      const parent = await this.getUser(current.parentId);

      if (parent.role === 'manager') {
        return parent.uid;
      }

      /*
       * Root HR / root manager terminate
       * the hierarchy.
       */
      if (this.isRoot(parent)) {
        return parent.uid;
      }

      current = parent;
    }

    /*
     * Fallback.
     */
    return user.uid;
  }

  // ==================================================
  // DESCENDANT OR SELF
  // ==================================================

  private async isDescendantOrSelf(rootId: string, targetId: string): Promise<boolean> {
    if (rootId === targetId) {
      return true;
    }

    let current = await this.getUser(targetId);

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      if (current.parentId === rootId) {
        return true;
      }

      current = await this.getUser(current.parentId);
    }

    return false;
  }

  // ==================================================
  // ROOT
  // ==================================================

  private isRoot(user: any) {
    return this.ROOT_ROLES.includes(user.role);
  }

  private getRootId(user: any): string {
    if (this.isRoot(user)) {
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

  private async permissions(uid: string): Promise<PermissionMap> {
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

  // Using on Attendance page to get the list of staff for the current user
  // ==================================================
  // GET AUTHORIZED STAFF
  // ==================================================

  async getStaff(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * --------------------------------------------------
     * LOAD ORGANIZATION
     * --------------------------------------------------
     *
     * Load all users belonging to the organization.
     *
     * Root users may not have rootId on their document,
     * so the root user is added separately when required.
     */

    const snap = await this.db.collection('user').where('rootId', '==', rootId).get();

    const users = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    /*
     * Root users may not have rootId.
     *
     * Add root user so the hierarchy remains complete.
     */
    if (!users.some((item) => item.id === rootId)) {
      const rootDoc = await this.db.collection('user').doc(rootId).get();

      if (rootDoc.exists) {
        users.push({
          id: rootDoc.id,
          ...rootDoc.data(),
        });
      }
    }

    /*
     * --------------------------------------------------
     * BUILD LOOKUPS
     * --------------------------------------------------
     */

    const userMap = new Map<string, any>();
    const byParent = new Map<string, any[]>();

    for (const item of users) {
      userMap.set(item.id, item);

      /*
       * Root manager is the organization head.
       * Users belonging directly to root may not have
       * parentId, so treat rootId as their implicit parent.
       */
      const parentId = item.parentId || (item.id !== rootId ? rootId : undefined);

      if (!parentId) {
        continue;
      }

      const children = byParent.get(parentId) ?? [];

      children.push(item);

      byParent.set(parentId, children);
    }
    /*
     * --------------------------------------------------
     * DETERMINE SCOPE
     * --------------------------------------------------
     *
     * ROOT:
     *   Entire organization.
     *
     * MANAGER:
     *   Own hierarchy.
     *
     * HR:
     *   Parent manager's complete hierarchy.
     *
     * HR does NOT get a separate/root scope.
     * HR simply acts within the hierarchy of its
     * owning manager.
     */

    const scopeRootId = this.isRoot(user) ? rootId : await this.getEffectiveScopeRootId(user);

    const scopeRoot = userMap.get(scopeRootId);

    if (!scopeRoot) {
      this.logger.error(
        `Invalid hierarchy | method=getStaff | user=${userId} scopeRootId=${scopeRootId} rootId=${rootId}`
      );

      throw new BadRequestException('Invalid hierarchy');
    }

    /*
     * --------------------------------------------------
     * BUILD SCOPE
     * --------------------------------------------------
     */

    const scopedUsers: any[] = [scopeRoot];

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      const children = byParent.get(parentId) ?? [];

      for (const child of children) {
        scopedUsers.push(child);

        walk(child.id);
      }
    };

    walk(scopeRootId);

    /*
     * Remove duplicates.
     */
    const uniqueUsers = Array.from(new Map(scopedUsers.map((item) => [item.id, item])).values());

    /*
     * --------------------------------------------------
     * DETERMINE VIEW PERMISSIONS
     * --------------------------------------------------
     *
     * ROOT:
     *   Root is the organization head.
     *   No permission document is required.
     *
     * MANAGER / HR:
     *   Read the requester's permissions ONCE.
     *
     * HR:
     *   HR acts on behalf of its parent manager's
     *   hierarchy, but role visibility is controlled
     *   by HR's own permissions.
     */

    let allowedRoles = new Set<string>();

    if (this.isRoot(user)) {
      /*
       * Root has complete organization-wide access.
       */
      allowedRoles = new Set(['manager', 'hr', 'field_executive']);
    } else {
      /*
       * Load requester permissions only once.
       */
      const permissions = await this.permissions(user.uid);

      if (permissions['manager.view'] === true) {
        allowedRoles.add('manager');
      }

      if (permissions['hr.view'] === true) {
        allowedRoles.add('hr');
      }

      if (permissions['field_executive.view'] === true) {
        allowedRoles.add('field_executive');
      }
    }

    /*
     * --------------------------------------------------
     * BUILD RESULT
     * --------------------------------------------------
     *
     * IMPORTANT:
     *
     * The current user is NEVER returned.
     */

    const result = uniqueUsers
      .filter((item) => {
        /*
         * Never return requester.
         */
        if (item.id === userId) {
          return false;
        }

        /*
         * Only return roles for which the requester
         * has view permission.
         */
        if (!allowedRoles.has(item.role)) {
          return false;
        }

        return true;
      })
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

          parentName: parent?.fullName ?? 'Root',

          shiftId: item.shiftId ?? '',

          teamId: item.teamId ?? '',
        };
      });

    /*
     * --------------------------------------------------
     * LOAD TEAMS
     * --------------------------------------------------
     *
     * Only load teams belonging to returned staff.
     */

    const teamIds = Array.from(new Set(result.map((item) => item.teamId).filter(Boolean)));

    const teamMap = new Map<string, any>();

    if (teamIds.length > 0) {
      const refs = teamIds.map((teamId) => this.db.collection('teams').doc(teamId));

      const teamDocs = await this.db.getAll(...refs);

      for (const doc of teamDocs) {
        if (!doc.exists) {
          continue;
        }

        teamMap.set(doc.id, {
          id: doc.id,
          ...doc.data(),
        });
      }
    }

    /*
     * --------------------------------------------------
     * ATTACH TEAM
     * --------------------------------------------------
     */

    const staff = result.map((item) => {
      const team = item.teamId ? teamMap.get(item.teamId) : undefined;

      return {
        ...item,

        teamName: team?.name ?? team?.teamName ?? '',
      };
    });

    return {
      users: staff,
    };
  }
}
