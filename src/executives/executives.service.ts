import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ExecutiveDto } from './dto/executive.dto';

@Injectable()
export class ExecutivesService {
  private readonly logger = new Logger(ExecutivesService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET EXECUTIVES
  // ==================================================

  async getAll(userId: string) {
    let user = await this.getUser(userId);
    if (user.role == 'hr') {
      const permissions = await this.permissions(userId);
    
      const hasPermission = permissions['field_executive.view'] === true;
      if (hasPermission) {
        user = await this.getUser(user.parentId);
        userId = user.uid;
      } else throw new ForbiddenException('You do not have permission to manage executive');
    }
    const rootId = this.getRootId(user);

    /*
     * Load complete organization
     * hierarchy once.
     */
    const [userSnap, teamSnap] = await Promise.all([
      this.db.collection('user').where('rootId', '==', rootId).get(),

      this.db.collection('teams').where('rootId', '==', rootId).get(),
    ]);

    const users = userSnap.docs.map((doc) => ({
      id: doc.id,

      ...doc.data(),
    })) as any[];

    /*
     * --------------------------------------------------
     * USER MAP
     * --------------------------------------------------
     */

    const userMap = new Map<string, any>(users.map((item) => [item.id, item]));

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

      if (!byParent.has(item.parentId)) {
        byParent.set(item.parentId, []);
      }

      byParent.get(item.parentId)!.push(item);
    }

    /*
     * --------------------------------------------------
     * VISIBLE MANAGERS
     * --------------------------------------------------
     */

    const visibleManagerIds = new Set<string>();

    /*
     * Root can see every manager.
     */
    if (this.isRoot(user)) {
      for (const item of users) {
        if (['manager', 'child_manager'].includes(item.role)) {
          visibleManagerIds.add(item.id);
        }
      }
    } else {
      /*
       * Non-root manager can see:
       *
       * self
       * descendants
       */
      visibleManagerIds.add(userId);

      const walkManagers = (parentId: string) => {
        for (const child of byParent.get(parentId) || []) {
          if (['manager', 'child_manager'].includes(child.role)) {
            visibleManagerIds.add(child.id);
          }

          walkManagers(child.id);
        }
      };

      walkManagers(userId);
    }

    /*
     * --------------------------------------------------
     * VISIBLE EXECUTIVES
     * --------------------------------------------------
     */

    const visibleExecutives = new Set<string>();

    if (this.isRoot(user)) {
      for (const item of users) {
        if (item.role === 'field_executive') {
          visibleExecutives.add(item.id);
        }
      }
    } else {
      const walkExecutives = (parentId: string) => {
        for (const child of byParent.get(parentId) || []) {
          if (child.role === 'field_executive') {
            visibleExecutives.add(child.id);
          }

          walkExecutives(child.id);
        }
      };

      walkExecutives(userId);
    }

    /*
     * --------------------------------------------------
     * EXECUTIVES
     * --------------------------------------------------
     */

    const executives = users
      .filter((item) => item.role === 'field_executive')
      .filter((item) => visibleExecutives.has(item.id))
      .map((item) => {
        const parent = userMap.get(item.parentId);

        const team = teamSnap.docs.find((doc) => doc.id === item.teamId);

        const teamData = team?.data() || {};

        return {
          id: item.id,

          fullName: item.fullName ?? '',

          mobile: item.mobile ?? '',

          email: item.email ?? '',

          teamId: item.teamId ?? '',

          teamName: teamData.name ?? '',

          parentId: item.parentId ?? '',

          parentName: parent?.fullName ?? 'Root',

          isActive: item.isActive !== false,

          isTrackingEnable: item.isTrackingEnable === true,

          gpsPriority: item.gpsPriority ?? 'low',
        };
      });

    /*
     * --------------------------------------------------
     * TEAMS
     *
     * Only expose teams that the
     * requester can actually manage.
     * --------------------------------------------------
     */

    const teams = teamSnap.docs
      .map((doc) => {
        const data = doc.data();

        const leadId = data.leadId ?? rootId;

        const lead = leadId ? userMap.get(leadId) : null;

        return {
          id: doc.id,

          name: data.name ?? '',

          leadId,

          leadName: lead?.fullName ?? 'Root',

          totalExecutives: users.filter((item) => item.role === 'field_executive' && item.teamId === doc.id).length,
        };
      })
      .filter((team) => {
        /*
         * Root can see every team.
         */
        if (this.isRoot(user)) {
          return true;
        }

        /*
         * Root-owned/unassigned team
         * is not available to a
         * child manager.
         */
        if (!team.leadId) {
          return false;
        }

        /*
         * Team must be led by
         * requester or descendant.
         */
        return visibleManagerIds.has(team.leadId);
      });

    return {
      executives,

      teams,
    };
  }

  // ==================================================
  // CREATE
  // ==================================================

  async create(userId: string, dto: ExecutiveDto) {
    this.logger.log(`Creating executive | user=${userId} | email=${dto.email} | teamId=${dto.teamId}`);

    const requester = await this.getUser(userId);

    /*
     * HR cannot create executives.
     */
    if (requester.role === 'hr') {
      throw new BadRequestException('HR cannot create field executives');
    }

    /*
     * Field executive cannot
     * manage anyone.
     */
    if (requester.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    /*
     * Permission.
     */
    if (!this.isRoot(requester)) {
      await this.authorize(userId, 'field_executive.create');
    }

    /*
     * Authentication credentials.
     */
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const rootId = this.getRootId(requester);

    /*
     * Get the team and verify
     * that requester can manage it.
     */
    const team = await this.verifyTeam(requester, dto.teamId);

    /*
     * Team MUST have a manager.
     *
     * An executive cannot belong
     * to a root-only/unassigned team.
     */
    if (!team.leadId && !this.isRoot(requester)) {
      throw new BadRequestException('Selected team has no manager');
    }

    /*
     * IMPORTANT:
     *
     * Executive parent is ALWAYS
     * the team's lead.
     *
     * Never requester.
     */
    const parentId =  team.leadId ;

    /*
     * Ensure selected team lead
     * is inside requester's
     * management hierarchy.
     */
    if (!this.isRoot(requester)) {
      await this.verifyManagerAccess(requester, parentId);
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
        });

      this.logger.log(
        `Executive created | id=${authUser.uid} | parent=${parentId} | team=${dto.teamId} | root=${rootId}`
      );
    } catch (error) {
      this.logger.error(
        `Firestore failed after Auth creation | id=${authUser.uid}`,
        error instanceof Error ? error.stack : undefined
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
  // UPDATE
  // ==================================================

  async update(userId: string, id: string, dto: ExecutiveDto) {
    let requester = await this.getUser(userId);
    const actualRequester = requester;

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
    if (this.getRootId(requester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    /*
     * HR cannot manage executives.
     */
    // if (requester.role === 'hr') {
    //   throw new BadRequestException('HR cannot manage field executives');
    // }

    /*
     * Field executive cannot
     * manage anyone.
     */
    if (requester.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    /*
     * Target must be inside
     * requester's hierarchy.
     */
    if (!this.isRoot(requester)) {
      await this.authorize(userId, 'field_executive.edit');
      if (requester.role == 'hr') {
        userId = requester.parentId;
        requester = await this.getUser(userId);
      }
      await this.verifyDescendant(userId, id);
    }

    /*
     * Verify selected team.
     */

    const team = await this.verifyTeam(requester, dto.teamId);

    /*
     * Executive cannot belong
     * to an unassigned/root-only team.
     */
    if (!team.leadId && !this.isRoot(requester)) {
      throw new BadRequestException('Selected team has no manager');
    }

    /*
     * Parent is always derived
     * from team.leadId.
     */
    const parentId = team.leadId;

    /*
     * Ensure requester has
     * authority over new parent.
     */
    if(!this.isRoot(requester)) {
      await this.verifyManagerAccess(requester, parentId);
    }

    /*
     * If team changes, parent can
     * change only because the new
     * team has a different manager.
     *
     * This keeps:
     *
     * parentId === team.leadId
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

        updatedBy: requester.uid || requester.id,

        updatedAt: new Date(),
      });

    /*
     * Password is optional on update.
     */
    if (dto.password) {
      await this.firebase.auth.updateUser(id, {
        password: dto.password,
      });
    }

    this.logger.log(`Executive updated | id=${id} | requester=${userId} | parent=${parentId} | team=${dto.teamId}`);

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // DELETE
  // ==================================================

  async remove(userId: string, id: string) {
    const requester = await this.getUser(userId);

    const target = await this.getUser(id);

    if (target.role !== 'field_executive') {
      throw new NotFoundException('Executive not found');
    }

    if (this.getRootId(requester) !== this.getRootId(target)) {
      throw new NotFoundException('Executive not found');
    }

    if (requester.role === 'hr') {
      throw new BadRequestException('HR cannot delete field executives');
    }

    if (requester.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    if (!this.isRoot(requester)) {
      await this.verifyDescendant(userId, id);

      await this.authorize(userId, 'field_executive.delete');
    }

    await Promise.all([this.db.collection('user').doc(id).delete(), this.firebase.auth.deleteUser(id)]);

    this.logger.log(`Executive deleted | id=${id} | requester=${userId}`);

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
     * Root can use any team
     * in the organization.
     */
    if (this.isRoot(requester)) {
      return {
        id: doc.id,

        ...data,
      };
    }

    /*
     * Root-only / unassigned teams
     * cannot be used by child managers.
     */
    if (!data.leadId) {
      throw new BadRequestException('Invalid team');
    }

    /*
     * Team lead must be inside
     * requester's hierarchy.
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
     * Only normal managers can
     * own a team / executive.
     */
    if (!['manager', 'child_manager'].includes(manager.role)) {
      throw new BadRequestException('Invalid team manager');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(requester) !== this.getRootId(manager)) {
      throw new BadRequestException('Invalid team manager');
    }

    /*
     * Root can access every manager
     * in the organization.
     */
    if (this.isRoot(requester)) {
      return;
    }

    /*
     * Requester can manage:
     *
     * - self
     * - descendants
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

    if (target.role !== 'manager' && target.role !== 'child_manager') {
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

    if (this.getRootId(parent) !== this.getRootId(target)) {
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

    if (this.isRoot(user)) {
      return;
    }

    // if (user.role === 'hr') {
    //   throw new BadRequestException('HR cannot manage field executives');
    // }

    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    const permissions = await this.permissions(userId);

    if (permissions[permission] !== true) {
      this.logger.warn(`Permission denied | user=${userId} permission=${permission}`);

      throw new BadRequestException('Permission denied');
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

      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new BadRequestException('Invalid hierarchy');
      }

      if (this.isRoot(parent)) {
        return;
      }

      const permissions = await this.permissions(parent.uid);

      if (permissions[permission] !== true) {
        this.logger.warn(`Parent authority denied | parent=${parent.uid} permission=${permission}`);

        throw new BadRequestException('Parent authority denied');
      }

      current = parent;
    }
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
    return ['root_manager', 'root_hr', 'root', 'admin'].includes(user.role);
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

  private async permissions(uid: string) {
    const doc = await this.db.collection('user').doc(uid).collection('settings').doc('permissions').get();

    return doc.exists ? (doc.data() ?? {}) : {};
  }
}
