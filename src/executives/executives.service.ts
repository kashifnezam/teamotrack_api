import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ExecutiveDto } from './dto/executive.dto';

type PermissionMap = Record<string, boolean>;

@Injectable()
export class ExecutivesService {
  private readonly logger = new Logger(ExecutivesService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // CONSTANTS
  // ==================================================

  private readonly ROOT_ROLES = ['root_manager', 'root_hr', 'root', 'admin'];

  private readonly MANAGER_ROLES = ['manager', 'child_manager'];

  private readonly HR_MANAGEABLE_ROLES = ['field_executive'];

  // ==================================================
  // GET EXECUTIVES
  // ==================================================

  async getAll(userId: string) {
    const actualRequester = await this.getUser(userId);

    /*
     * --------------------------------------------------
     * DETERMINE EFFECTIVE SCOPE
     * --------------------------------------------------
     *
     * ROOT:
     *   Entire organization.
     *
     * MANAGER:
     *   Own manager hierarchy.
     *
     * HR:
     *   HR acts inside the hierarchy of its parent.
     *
     *   If parent is a normal manager:
     *
     *      Manager
     *       ├── HR
     *       ├── Executive
     *       └── Child Manager
     *            └── Executive
     *
     *   If parent is root:
     *
     *      Root
     *       ├── Manager A
     *       ├── Manager B
     *       ├── Executive
     *       └── ...
     *
     *   HR therefore gets the complete organization
     *   when its parent is root.
     */

    let effectiveUser = actualRequester;

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR does not have a separate root hierarchy.
     *
     * Its parent determines its effective scope.
     *
     * Permission is checked against the ACTUAL HR.
     */
    if (actualRequester.role === 'hr') {
      await this.authorize(actualRequester.uid, 'field_executive.view');

      if (!actualRequester.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      effectiveUser = await this.getUser(actualRequester.parentId);
    }

    /*
     * --------------------------------------------------
     * MANAGER / OTHER NON-ROOT USERS
     * --------------------------------------------------
     *
     * Permission belongs to the actual requester.
     */
    else if (!this.isRoot(actualRequester)) {
      await this.authorize(actualRequester.uid, 'field_executive.view');
    }

    const rootId = this.getRootId(effectiveUser);

    /*
     * --------------------------------------------------
     * LOAD ORGANIZATION
     * --------------------------------------------------
     */

    const [userSnap, teamSnap, shiftSnap] = await Promise.all([
      this.db.collection('user').where('rootId', '==', rootId).get(),

      this.db.collection('teams').where('rootId', '==', rootId).get(),

      this.db.collection('shifts').where('rootId', '==', rootId).get(),
    ]);

    const users = userSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    const teams = teamSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    const shifts = shiftSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    /*
     * --------------------------------------------------
     * MAPS
     * --------------------------------------------------
     */

    const userMap = new Map<string, any>(users.map((item) => [item.id, item]));

    const teamMap = new Map<string, any>(teams.map((item) => [item.id, item]));

    const shiftMap = new Map<string, any>(shifts.map((item) => [item.id, item]));

    /*
     * --------------------------------------------------
     * PARENT -> CHILDREN
     * --------------------------------------------------
     */

    const byParent = new Map<string, any[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      const children = byParent.get(item.parentId) ?? [];

      children.push(item);

      byParent.set(item.parentId, children);
    }

    /*
     * --------------------------------------------------
     * VISIBLE EXECUTIVES
     * --------------------------------------------------
     */

    const visibleExecutives = new Set<string>();

    /*
     * ROOT
     *
     * Root sees every executive in organization.
     */
    if (this.isRoot(effectiveUser)) {
      for (const item of users) {
        if (item.role === 'field_executive') {
          visibleExecutives.add(item.id);
        }
      }
    }

    /*
     * NON-ROOT
     *
     * Effective manager sees executives
     * inside its hierarchy.
     */
    else {
      const walkExecutives = (parentId: string) => {
        const children = byParent.get(parentId) ?? [];

        for (const child of children) {
          /*
           * Executive belongs to this hierarchy.
           */
          if (child.role === 'field_executive') {
            visibleExecutives.add(child.id);

            continue;
          }

          /*
           * HR is not another hierarchy level.
           *
           * Important:
           *
           * HR is handled through its parent manager.
           * We do not walk through HR.
           */
          if (child.role === 'hr') {
            continue;
          }

          /*
           * Continue through managers.
           */
          if (this.MANAGER_ROLES.includes(child.role)) {
            walkExecutives(child.id);
          }
        }
      };

      walkExecutives(effectiveUser.uid);
    }

    /*
     * --------------------------------------------------
     * EXECUTIVES
     * --------------------------------------------------
     */

    const executives = users
      .filter((item) => item.role === 'field_executive' && visibleExecutives.has(item.id))
      .map((item) => {
        const parent = userMap.get(item.parentId);

        const team = item.teamId ? teamMap.get(item.teamId) : null;

        /*
         * Executive shift:
         *
         * executive.teamId
         *       ↓
         * team.shiftId
         *       ↓
         * shifts/{shiftId}
         */
        const shift = team?.shiftId ? shiftMap.get(team.shiftId) : null;

        return {
          id: item.id,

          fullName: item.fullName ?? '',

          mobile: item.mobile ?? '',

          email: item.email ?? '',

          teamId: item.teamId ?? '',

          teamName: team?.name ?? '',

          shiftId: team?.shiftId ?? '',

          shiftName: shift?.name ?? '',

          shift: shift ? this.pickShift(shift) : null,

          parentId: item.parentId ?? '',

          parentName: parent?.fullName ?? 'Root',

          isActive: item.isActive !== false,

          isTrackingEnable: item.isTrackingEnable === true,

          gpsPriority: item.gpsPriority ?? 'low',
        };
      });

    /*
     * --------------------------------------------------
     * VISIBLE TEAMS
     * --------------------------------------------------
     *
     * Teams are returned for the effective hierarchy.
     */

    const visibleManagerIds = new Set<string>();

    if (this.isRoot(effectiveUser)) {
      /*
       * Root sees every manager.
       */
      for (const item of users) {
        if (this.MANAGER_ROLES.includes(item.role)) {
          visibleManagerIds.add(item.id);
        }
      }
    } else {
      /*
       * Effective manager itself.
       */
      visibleManagerIds.add(effectiveUser.uid);

      /*
       * Descendant managers.
       */
      const walkManagers = (parentId: string) => {
        const children = byParent.get(parentId) ?? [];

        for (const child of children) {
          if (this.MANAGER_ROLES.includes(child.role)) {
            visibleManagerIds.add(child.id);

            walkManagers(child.id);
          }

          /*
           * HR is not a hierarchy node.
           */
          if (child.role === 'hr') {
            continue;
          }
        }
      };

      walkManagers(effectiveUser.uid);
    }

    const visibleTeams = teams
      .map((team) => {
        const leadId = team.leadId ?? rootId;

        const lead = leadId ? userMap.get(leadId) : null;

        const shift = team.shiftId ? shiftMap.get(team.shiftId) : null;

        return {
          id: team.id,

          name: team.name ?? '',

          leadId,

          leadName: lead?.fullName ?? 'Root',

          shiftId: team.shiftId ?? '',

          shiftName: shift?.name ?? '',

          shift: shift ? this.pickShift(shift) : null,

          totalExecutives: users.filter((item) => item.role === 'field_executive' && item.teamId === team.id).length,
        };
      })
      .filter((team) => {
        /*
         * Root sees every team.
         */
        if (this.isRoot(effectiveUser)) {
          return true;
        }

        /*
         * Non-root teams must have a manager lead.
         */
        if (!team.leadId) {
          return false;
        }

        return visibleManagerIds.has(team.leadId);
      });

    return {
      executives,

      teams: visibleTeams,
    };
  }

  // ==================================================
  // CREATE EXECUTIVE
  // ==================================================

  async create(userId: string, dto: ExecutiveDto) {
    this.logger.log(`Creating executive | user=${userId} | email=${dto.email} | teamId=${dto.teamId}`);

    const actualRequester = await this.getUser(userId);

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR CAN create executives.
     *
     * However:
     *
     * 1. HR must have field_executive.create.
     * 2. HR must have a parent.
     * 3. The selected team must belong to the
     *    HR's parent's hierarchy.
     *
     * The parent itself is NOT changed to HR.
     *
     * Executive parent is always the team lead.
     */

    let effectiveRequester = actualRequester;

    if (actualRequester.role === 'hr') {
      await this.authorize(actualRequester.uid, 'field_executive.create');

      if (!actualRequester.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      effectiveRequester = await this.getUser(actualRequester.parentId);
    }

    /*
     * --------------------------------------------------
     * NORMAL USERS
     * --------------------------------------------------
     */
    else if (!this.isRoot(actualRequester)) {
      /*
       * Executive itself can never create
       * another executive.
       */
      if (actualRequester.role === 'field_executive') {
        throw new ForbiddenException('Executive cannot manage executives');
      }

      await this.authorize(actualRequester.uid, 'field_executive.create');
    }

    /*
     * --------------------------------------------------
     * CREDENTIALS
     * --------------------------------------------------
     */

    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    /*
     * --------------------------------------------------
     * ROOT
     * --------------------------------------------------
     */

    const rootId = this.getRootId(effectiveRequester);

    /*
     * --------------------------------------------------
     * TEAM
     * --------------------------------------------------
     *
     * Verify team using effective requester.
     *
     * This is important for HR:
     *
     * HR
     *  ↓
     * Parent Manager
     *  ↓
     * Team
     */

    const team = await this.verifyTeam(effectiveRequester, dto.teamId);

    /*
     * --------------------------------------------------
     * TEAM LEAD
     * --------------------------------------------------
     *
     * Executive parent is ALWAYS
     * the team's manager.
     */

    const parentId = team.leadId ?? '';

    /*
     * Root can create an executive in
     * a root/unassigned team.
     *
     * Non-root HR/manager cannot.
     */
    if (!parentId && !this.isRoot(effectiveRequester)) {
      throw new BadRequestException('Selected team has no manager');
    }

    /*
     * --------------------------------------------------
     * VERIFY PARENT MANAGER
     * --------------------------------------------------
     */

    if (parentId) {
      await this.verifyManagerAccess(effectiveRequester, parentId);
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

          parentId,

          role: 'field_executive',

          fullName: dto.fullName,

          email: dto.email,

          mobile: dto.mobile ?? '',

          teamId: dto.teamId,

          isActive: dto.isActive !== false,

          isTrackingEnable: dto.isTrackingEnable === true,

          gpsPriority: dto.gpsPriority ?? 'low',

          createdAt: new Date(),

          updatedAt: new Date(),

          /*
           * Person who created the executive.
           */
          createdBy: actualRequester.uid,
        });

      /*
       * --------------------------------------------------
       * DEFAULT EXECUTIVE PERMISSIONS
       * --------------------------------------------------
       *
       * Permissions are created immediately.
       *
       * The executive's permissions can never
       * exceed the parent authority.
       */
      await this.createExecutivePermissions(authUser.uid, parentId || rootId);

      this.logger.log(
        `Executive created | id=${authUser.uid} | parent=${parentId || rootId} | team=${dto.teamId} | root=${rootId} | requester=${actualRequester.uid}`
      );
    } catch (error) {
      this.logger.error(
        `Firestore failed after Auth creation | id=${authUser.uid}`,
        error instanceof Error ? error.stack : String(error)
      );

      await this.firebase.auth.deleteUser(authUser.uid);

      throw error;
    }

    return {
      success: true,

      id: authUser.uid,
    };
  }

  // ==================================================
  // UPDATE EXECUTIVE
  // ==================================================

  async update(userId: string, id: string, dto: ExecutiveDto) {
    const actualRequester = await this.getUser(userId);

    let effectiveRequester = actualRequester;

    const target = await this.getUser(id);

    /*
     * --------------------------------------------------
     * TARGET
     * --------------------------------------------------
     */

    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
    }

    /*
     * --------------------------------------------------
     * SAME ORGANIZATION
     * --------------------------------------------------
     */

    if (this.getRootId(actualRequester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR can update an executive if:
     *
     * - HR has field_executive.edit
     * - executive belongs to HR's parent
     *   manager hierarchy
     *
     * If HR's parent is root, the effective
     * scope becomes the complete organization.
     */

    if (actualRequester.role === 'hr') {
      await this.authorize(actualRequester.uid, 'field_executive.edit');

      if (!actualRequester.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      effectiveRequester = await this.getUser(actualRequester.parentId);

      /*
       * Root parent means complete organization.
       *
       * verifyDescendant() would fail because
       * root itself is not necessarily represented
       * as a normal descendant node.
       */
      if (!this.isRoot(effectiveRequester)) {
        await this.verifyDescendant(effectiveRequester.uid, id);
      }
    }

    /*
     * --------------------------------------------------
     * NORMAL MANAGER
     * --------------------------------------------------
     */
    else if (!this.isRoot(actualRequester)) {
      /*
       * Executive cannot manage
       * another executive account.
       */
      if (actualRequester.role === 'field_executive') {
        throw new ForbiddenException('Executive cannot manage executives');
      }

      await this.authorize(actualRequester.uid, 'field_executive.edit');

      await this.verifyDescendant(actualRequester.uid, id);
    }

    /*
     * --------------------------------------------------
     * TEAM
     * --------------------------------------------------
     */

    const team = await this.verifyTeam(effectiveRequester, dto.teamId);

    /*
     * Non-root effective users cannot use
     * root/unassigned teams.
     */
    if (!team.leadId && !this.isRoot(effectiveRequester)) {
      throw new BadRequestException('Selected team has no manager');
    }

    /*
     * --------------------------------------------------
     * NEW PARENT
     * --------------------------------------------------
     *
     * Parent is always derived from
     * selected team's manager.
     */

    const parentId = team.leadId ?? '';

    /*
     * Verify the new manager is within
     * effective requester's authority.
     */
    if (parentId) {
      await this.verifyManagerAccess(effectiveRequester, parentId);
    }

    /*
     * --------------------------------------------------
     * UPDATE
     * --------------------------------------------------
     */

    await this.db
      .collection('user')
      .doc(id)
      .update({
        fullName: dto.fullName,

        mobile: dto.mobile ?? '',

        teamId: dto.teamId,

        parentId,

        isActive: dto.isActive !== false,

        isTrackingEnable: dto.isTrackingEnable === true,

        gpsPriority: dto.gpsPriority ?? 'low',

        updatedBy: actualRequester.uid,

        updatedAt: new Date(),
      });

    /*
     * --------------------------------------------------
     * PASSWORD
     * --------------------------------------------------
     */

    if (dto.password) {
      await this.firebase.auth.updateUser(id, {
        password: dto.password,
      });
    }

    this.logger.log(
      `Executive updated | id=${id} | requester=${actualRequester.uid} | effectiveRequester=${effectiveRequester.uid} | parent=${parentId} | team=${dto.teamId}`
    );

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // DELETE EXECUTIVE
  // ==================================================

  async remove(userId: string, id: string) {
    const actualRequester = await this.getUser(userId);

    let effectiveRequester = actualRequester;

    const target = await this.getUser(id);

    /*
     * Target must be executive.
     */
    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(actualRequester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR may delete only if explicitly
     * given field_executive.delete.
     */
    if (actualRequester.role === 'hr') {
      await this.authorize(actualRequester.uid, 'field_executive.delete');

      if (!actualRequester.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      effectiveRequester = await this.getUser(actualRequester.parentId);

      /*
       * If HR belongs directly to root,
       * HR can access the whole organization.
       */
      if (!this.isRoot(effectiveRequester)) {
        await this.verifyDescendant(effectiveRequester.uid, id);
      }
    }

    /*
     * --------------------------------------------------
     * NORMAL MANAGER
     * --------------------------------------------------
     */
    else if (!this.isRoot(actualRequester)) {
      if (actualRequester.role === 'field_executive') {
        throw new ForbiddenException('Executive cannot manage executives');
      }

      await this.authorize(actualRequester.uid, 'field_executive.delete');

      await this.verifyDescendant(actualRequester.uid, id);
    }

    /*
     * --------------------------------------------------
     * DELETE
     * --------------------------------------------------
     */

    await Promise.all([this.db.collection('user').doc(id).delete(), this.firebase.auth.deleteUser(id)]);

    this.logger.log(
      `Executive deleted | id=${id} | requester=${actualRequester.uid} | effectiveRequester=${effectiveRequester.uid}`
    );

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // VERIFY TEAM
  // ==================================================

  private async verifyTeam(requester: any, teamId: string): Promise<any> {
    if (!teamId) {
      throw new BadRequestException('Team is required');
    }

    const rootId = this.getRootId(requester);

    const doc = await this.db.collection('teams').doc(teamId).get();

    if (!doc.exists) {
      throw new BadRequestException('Invalid team');
    }

    const data = doc.data() as any;

    /*
     * Same organization.
     */
    if (data.rootId !== rootId) {
      throw new BadRequestException('Invalid team');
    }

    /*
     * Root can use any team.
     */
    if (this.isRoot(requester)) {
      return {
        id: doc.id,

        ...data,
      };
    }

    /*
     * Non-root users require
     * a manager-led team.
     */
    if (!data.leadId) {
      throw new BadRequestException('Invalid team');
    }

    /*
     * Team lead must be inside
     * requester's manager hierarchy.
     */
    await this.verifyManagerAccess(requester, data.leadId);

    return {
      id: doc.id,

      ...data,
    };
  }

  // ==================================================
  // VERIFY MANAGER ACCESS
  // ==================================================

  private async verifyManagerAccess(requester: any, managerId: string) {
    if (!managerId) {
      throw new BadRequestException('Team manager is required');
    }

    const manager = await this.getUser(managerId);

    /*
     * Team owners must be managers.
     */
    if (!this.MANAGER_ROLES.includes(manager.role)) {
      throw new BadRequestException('Invalid team manager');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(requester) !== this.getRootId(manager)) {
      throw new BadRequestException('Invalid team manager');
    }

    /*
     * Root has complete authority.
     */
    if (this.isRoot(requester)) {
      return;
    }

    /*
     * Requester can use:
     *
     * - itself
     * - descendant managers
     */
    if (requester.uid === manager.uid) {
      return;
    }

    await this.verifyManagerDescendant(requester.uid, manager.uid);
  }

  // ==================================================
  // VERIFY MANAGER DESCENDANT
  // ==================================================

  private async verifyManagerDescendant(parentId: string, targetId: string) {
    const target = await this.getUser(targetId);

    if (!this.MANAGER_ROLES.includes(target.role)) {
      throw new NotFoundException('Manager not found');
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

    throw new NotFoundException('Manager not found');
  }

  // ==================================================
  // VERIFY EXECUTIVE DESCENDANT
  // ==================================================

  private async verifyDescendant(parentId: string, targetId: string) {
    if (parentId === targetId) {
      throw new BadRequestException('Cannot manage yourself');
    }

    const parent = await this.getUser(parentId);

    const target = await this.getUser(targetId);

    /*
     * Same organization.
     */
    if (this.getRootId(parent) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * Target must be executive.
     */
    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
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

    throw new NotFoundException('Executive not found');
  }

  // ==================================================
  // AUTHORIZATION
  // ==================================================

  private async authorize(userId: string, permission: string) {
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
     * HR is now permission based.
     *
     * HR may manage executives when its own
     * permission is enabled AND the parent
     * authority chain allows it.
     */
    if (user.role === 'hr') {
      const permissions = await this.permissions(userId);

      if (permissions[permission] !== true) {
        this.logger.warn(`HR permission denied | user=${userId} permission=${permission}`);

        throw new ForbiddenException('Permission denied');
      }

      await this.verifyAuthorityChain(userId, permission);

      return;
    }

    /*
     * --------------------------------------------------
     * EXECUTIVE
     * --------------------------------------------------
     *
     * Executive cannot manage executive
     * accounts.
     */
    if (user.role === 'field_executive') {
      throw new ForbiddenException('Executive cannot manage executives');
    }

    /*
     * --------------------------------------------------
     * MANAGER
     * --------------------------------------------------
     */

    const permissions = await this.permissions(userId);

    if (permissions[permission] !== true) {
      this.logger.warn(`Permission denied | user=${userId} permission=${permission}`);

      throw new ForbiddenException('Permission denied');
    }

    await this.verifyAuthorityChain(userId, permission);
  }

  // ==================================================
  // AUTHORITY CHAIN
  // ==================================================

  private async verifyAuthorityChain(userId: string, permission: string) {
    let current = await this.getUser(userId);

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      const parent = await this.getUser(current.parentId);

      /*
       * Hierarchy must remain inside
       * the same organization.
       */
      if (this.getRootId(current) !== this.getRootId(parent)) {
        this.logger.error(`Invalid hierarchy | current=${current.uid} parent=${parent.uid} permission=${permission}`);

        throw new BadRequestException('Invalid hierarchy');
      }

      /*
       * Root terminates the chain.
       */
      if (this.isRoot(parent)) {
        return;
      }

      /*
       * Parent must also possess
       * the same authority.
       */
      const parentPermissions = await this.permissions(parent.uid);

      if (parentPermissions[permission] !== true) {
        this.logger.warn(`Parent authority denied | parent=${parent.uid} permission=${permission} parentPermissions[permission]`);

        throw new ForbiddenException('Parent authority denied');
      }

      current = parent;
    }
  }

  // ==================================================
  // CREATE EXECUTIVE PERMISSIONS
  // ==================================================

  private async createExecutivePermissions(uid: string, parentId: string) {
    /*
     * --------------------------------------------------
     * PARENT PERMISSIONS
     * --------------------------------------------------
     *
     * If the parent is a root user, root has complete
     * authority and does not require a permission document.
     *
     * Otherwise, load the parent's permissions so the
     * executive can never receive authority greater than
     * the parent.
     */
    const parent = await this.getUser(parentId);

    let parentPermissions: PermissionMap = {};

    if (!this.isRoot(parent)) {
      parentPermissions = await this.permissions(parentId);
    }

    /*
     * --------------------------------------------------
     * EXECUTIVE DEFAULT PERMISSIONS
     * --------------------------------------------------
     *
     * Executive permissions are intentionally minimal.
     *
     * IMPORTANT:
     *
     * task.create defaults to FALSE.
     *
     * A manager must explicitly grant task.create
     * permission to the executive.
     */
    const permissions: PermissionMap = {
      'task.create': false,
      'task.edit': false,
      'task.delete': false,
    };

    /*
     * --------------------------------------------------
     * PARENT AUTHORITY LIMIT
     * --------------------------------------------------
     *
     * A child can never receive a permission that its
     * parent does not possess.
     *
     * Therefore:
     *
     * Parent:
     *   task.create = false
     *
     * Executive:
     *   task.create MUST remain false
     *
     * If parent has task.create = true, the executive
     * starts with false and can later be explicitly
     * granted true through the permission-management UI.
     */
    if (!this.isRoot(parent)) {
      for (const key of Object.keys(permissions)) {
        if (parentPermissions[key] === false) {
          permissions[key] = false;
        }
      }
    }

    /*
     * --------------------------------------------------
     * SAVE PERMISSIONS
     * --------------------------------------------------
     *
     * user/{executiveId}/settings/permissions
     */
    await this.db.collection('user').doc(uid).collection('settings').doc('permissions').set(permissions);

    this.logger.log(
      `Executive permissions created | executive=${uid} | parent=${parentId} | task.create=${permissions['task.create']}`
    );
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
  // ROOT
  // ==================================================

  private isRoot(user: any) {
    return this.ROOT_ROLES.includes(user.role);
  }

  private getRootId(user: any): string {
    /*
     * Root user's own UID is the
     * organization root.
     */
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

    return doc.exists ? ((doc.data() ?? {}) as PermissionMap) : {};
  }

  // ==================================================
  // SHIFT
  // ==================================================

  private pickShift(data: any) {
    return {
      name: data.name ?? '',

      startHour: data.startHour ?? 0,

      startMinute: data.startMinute ?? 0,

      endHour: data.endHour ?? 0,

      endMinute: data.endMinute ?? 0,

      breakStartHour: data.breakStartHour ?? null,

      breakStartMinute: data.breakStartMinute ?? null,

      breakEndHour: data.breakEndHour ?? null,

      breakEndMinute: data.breakEndMinute ?? null,

      graceMinutes: data.graceMinutes ?? 0,

      halfDayMinutes: data.halfDayMinutes ?? 0,

      fullDayMinutes: data.fullDayMinutes ?? 0,

      weeklyOff: data.weeklyOff ?? [],

      selfieCheckIn: data.selfieCheckIn ?? false,

      selfieCheckOut: data.selfieCheckOut ?? false,
    };
  }

  // ==================================================
  // GET PERMISSIONS
  // ==================================================

  async getPermissions(userId: string, id: string) {
    const requester = await this.getUser(userId);

    const target = await this.getUser(id);

    /*
     * Target must be an executive.
     */
    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(requester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * Root can manage every executive.
     */
    if (!this.isRoot(requester)) {
      /*
       * HR
       */
      if (requester.role === 'hr') {
        await this.authorize(requester.uid, 'field_executive.view');

        if (!requester.parentId) {
          throw new ForbiddenException('HR is not assigned to a parent manager');
        }

        const parent = await this.getUser(requester.parentId);

        /*
         * Root parent = entire organization.
         */
        if (!this.isRoot(parent)) {
          await this.verifyDescendant(parent.uid, id);
        }
      }

      /*
       * Manager
       */
      else {
        await this.authorize(requester.uid, 'field_executive.view');

        await this.verifyDescendant(requester.uid, id);
      }
    }

    return {
      id,
      role: target.role,
      permissions: {
        'task.create': (await this.permissions(id))['task.create'] === true,
        'task.edit': (await this.permissions(id))['task.edit'] === true,
        'task.delete': (await this.permissions(id))['task.delete'] === true,
      },
    };
  }
  // ==================================================
  // UPDATE PERMISSIONS
  // ==================================================

  async updatePermissions(userId: string, id: string, permissions: PermissionMap) {
    const requester = await this.getUser(userId);
    const target = await this.getUser(id);

    /*
     * Target must be an executive.
     */
    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(requester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * --------------------------------------------------
     * DETERMINE AUTHORITY
     * --------------------------------------------------
     */

    let effectiveRequester = requester;

    if (requester.role === 'hr') {
      /*
       * HR must have permission-management authority.
       */
      await this.authorize(requester.uid, 'field_executive.manage_permissions');

      if (!requester.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      effectiveRequester = await this.getUser(requester.parentId);

      /*
       * HR whose parent is root has organization-wide
       * executive scope.
       */
      if (!this.isRoot(effectiveRequester)) {
        await this.verifyDescendant(effectiveRequester.uid, id);
      }
    } else if (!this.isRoot(requester)) {
      /*
       * Normal manager.
       */
      await this.authorize(requester.uid, 'field_executive.manage_permissions');

      await this.verifyDescendant(requester.uid, id);
    }

    /*
     * --------------------------------------------------
     * EXECUTIVE PERMISSIONS
     * --------------------------------------------------
     *
     * Keep the permission keys explicit here so that
     * only valid executive permissions can be written.
     */

    const finalPermissions: PermissionMap = {
      'task.create': permissions['task.create'] === true,

      'task.edit': permissions['task.edit'] === true,

      'task.delete': permissions['task.delete'] === true,
    };

    /*
     * --------------------------------------------------
     * PARENT AUTHORITY
     * --------------------------------------------------
     *
     * Executive cannot receive a permission that its
     * parent manager does not have.
     *
     * Root has unrestricted authority.
     */

    const parentId = target.parentId;

    if (!parentId) {
      /*
       * Root-owned executive.
       */
      if (!this.isRoot(effectiveRequester)) {
        throw new BadRequestException('Executive has no parent');
      }
    } else {
      const parent = await this.getUser(parentId);

      if (!this.isRoot(parent)) {
        const parentPermissions = await this.permissions(parent.uid);

        /*
         * Check every executive permission using
         * the same permission key.
         */
        for (const key of Object.keys(finalPermissions)) {
          if (finalPermissions[key] === true && parentPermissions[key] !== true) {
            this.logger.warn(`Permission denied | parent=${parent.uid} target=${id} key=${key}`);

            throw new BadRequestException(`Parent does not allow ${key}`);
          }
        }
      }
    }

    /*
     * --------------------------------------------------
     * SAVE
     * --------------------------------------------------
     */

    await this.db.collection('user').doc(id).collection('settings').doc('permissions').set(finalPermissions);

    this.logger.log(
      `Executive permissions updated | parent=${userId} target=${id} | ` +
        `task.create=${finalPermissions['task.create']} | ` +
        `task.edit=${finalPermissions['task.edit']} | ` +
        `task.delete=${finalPermissions['task.delete']}`
    );

    return {
      success: true,
    };
  }
}
