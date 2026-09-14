import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { LiveTrackingDto } from './dto/live-tracking.dto';

@Injectable()
export class LiveTrackingService {
  private readonly logger = new Logger(LiveTrackingService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // LIVE
  // ==================================================

  async getLive(userId: string) {
    const user = await this.getUser(userId);

    /*
     * Resolve the effective user whose
     * hierarchy should be used for tracking.
     *
     * Rules:
     *
     * Root:
     *   -> access all executives.
     *
     * Manager:
     *   -> requires tracking.view
     *   -> access own hierarchy.
     *
     * HR:
     *   -> requires tracking.view
     *   -> acts on behalf of parent manager.
     *   -> if parent is root, access all executives.
     *   -> otherwise access parent manager hierarchy.
     *
     * Field Executive:
     *   -> no access.
     */
    const access = await this.resolveTrackingAccess(user);

    const rootId = this.getRootId(user);

    try {
      /*
       * Load ONLY field executives.
       *
       * This is important:
       *
       * HR must never receive managers,
       * child managers, or other HR users.
       *
       * The query itself is restricted to
       * field_executive.
       */
      const snapshot = await this.db
        .collection('user')
        .where('rootId', '==', rootId)
        .where('role', '==', 'field_executive')
        .where('isTrackingEnable', '==', true)
        .select('fullName', 'teamId', 'isActive', 'parentId', 'rootId')
        .get();

      /*
       * Root can see all executives
       * in the organization.
       */
      if (access.isRoot) {
        return {
          executives: snapshot.docs.map((doc) => this.pickLive(doc)),
        };
      }

      /*
       * Get complete hierarchy for
       * the effective manager.
       *
       * For a manager:
       *
       *   effectiveUser = manager
       *
       * For HR:
       *
       *   effectiveUser = HR's parent manager
       */
      const users = await this.getUsers(rootId);

      const visibleIds = this.getDescendantIds(access.effectiveUser.uid, users);

      return {
        executives: snapshot.docs.filter((doc) => visibleIds.has(doc.id)).map((doc) => this.pickLive(doc)),
      };
    } catch (error) {
      this.logger.error(
        `Live tracking fetch failed | user=${userId}`,
        error instanceof Error ? error.stack : undefined
      );

      throw error;
    }
  }

  // ==================================================
  // HISTORY
  // ==================================================

  async getHistory(userId: string, dto: LiveTrackingDto) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    /*
     * Resolve tracking access first.
     *
     * This also verifies:
     *
     * - permission
     * - role
     * - HR parent
     * - root hierarchy
     */
    const access = await this.resolveTrackingAccess(user);

    this.logger.log(`Fetching tracking history | user=${userId} | executive=${dto.executiveId} | date=${dto.date}`);

    /*
     * IMPORTANT:
     *
     * This method ONLY allows a field executive
     * as the requested target.
     *
     * Therefore HR can never retrieve:
     *
     * - HR history
     * - Manager history
     * - Child manager history
     *
     * because those users are rejected
     * inside verifyExecutive().
     */
    await this.verifyExecutive(user, dto.executiveId, rootId, access);

    const dayId = dto.date.replace(/-/g, '');

    try {
      const snapshot = await this.db
        .collection('history_tpr')
        .doc(dto.executiveId)
        .collection('days')
        .doc(dayId)
        .collection('packets')
        .orderBy('endTime')
        .get();

      this.logger.log(
        `Tracking history fetched | executive=${dto.executiveId} | date=${dto.date} | packets=${snapshot.size}`
      );

      return snapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          locations: this.decodePolyline(data.encodedPolyline ?? ''),

          startTime: data.startTime ?? 0,

          endTime: data.endTime ?? 0,

          offlinePacket: data.offlinePacket === true,

          timestamp: data.timestamp ?? null,
        };
      });
    } catch (error) {
      this.logger.error(
        `Tracking history fetch failed | executive=${dto.executiveId} | date=${dto.date}`,
        error instanceof Error ? error.stack : undefined
      );

      throw error;
    }
  }

  // ==================================================
  // TRACKING ACCESS
  // ==================================================

  private async resolveTrackingAccess(user: any) {
    /*
     * Field executive can never
     * access live tracking/history.
     */
    if (user.role === 'field_executive') {
      throw new ForbiddenException('User cannot access tracking');
    }

    /*
     * --------------------------------------------------
     * ROOT
     * --------------------------------------------------
     *
     * Root manager is superior and can
     * access all executive tracking data.
     *
     * No permission check is required.
     */
    if (this.isRoot(user)) {
      return {
        effectiveUser: user,

        isRoot: true,
      };
    }

    /*
     * --------------------------------------------------
     * MANAGER
     * --------------------------------------------------
     *
     * Manager requires tracking.view.
     *
     * The manager can access executives
     * inside their own hierarchy.
     */
    if (['manager', 'child_manager'].includes(user.role)) {
      await this.authorizeTracking(user);

      return {
        effectiveUser: user,

        isRoot: false,
      };
    }

    /*
     * --------------------------------------------------
     * HR
     * --------------------------------------------------
     *
     * HR requires tracking.view.
     *
     * HR does NOT become a hierarchy node.
     *
     * HR acts on behalf of the parent manager.
     */
    if (user.role === 'hr') {
      await this.authorizeTracking(user);

      /*
       * HR must have a parent manager.
       */
      if (!user.parentId) {
        throw new ForbiddenException('HR is not assigned to a parent manager');
      }

      const parent = await this.getUser(user.parentId);

      /*
       * Parent must belong to
       * the same organization.
       */
      if (this.getRootId(parent) !== this.getRootId(user)) {
        throw new ForbiddenException('Invalid HR hierarchy');
      }

      /*
       * If HR's parent is root,
       * HR can access all executives.
       *
       * This is how root HR behavior is
       * supported without a root_hr role.
       */
      if (this.isRoot(parent)) {
        return {
          effectiveUser: parent,

          isRoot: true,
        };
      }

      /*
       * HR acts on behalf of the
       * parent manager.
       *
       * Therefore HR gets exactly the
       * same executive hierarchy scope
       * as the parent manager.
       */
      if (!['manager', 'child_manager'].includes(parent.role)) {
        throw new ForbiddenException('HR parent must be a manager');
      }

      return {
        effectiveUser: parent,

        isRoot: false,
      };
    }

    /*
     * --------------------------------------------------
     * OTHER ROLES
     * --------------------------------------------------
     */

    throw new ForbiddenException('User cannot access tracking');
  }

  // ==================================================
  // TRACKING AUTHORIZATION
  // ==================================================

  private async authorizeTracking(user: any) {
    /*
     * Root is always authorized.
     */
    if (this.isRoot(user)) {
      return;
    }

    /*
     * Field executive cannot access
     * tracking even if a permission
     * accidentally exists.
     */
    if (user.role === 'field_executive') {
      throw new ForbiddenException('User cannot access tracking');
    }

    /*
     * Only managers and HR can use
     * tracking.view.
     */
    if (!['manager', 'child_manager', 'hr'].includes(user.role)) {
      throw new ForbiddenException('User cannot access tracking');
    }

    const permissions = await this.getPermissions(user.uid);

    /*
     * User must explicitly have
     * tracking.view permission.
     */
    if (permissions['tracking.view'] !== true) {
      this.logger.warn(`Tracking permission denied | user=${user.uid} | role=${user.role}`);

      throw new ForbiddenException('You do not have permission to access tracking');
    }

    /*
     * Manager/HR authority itself must
     * ultimately originate from root.
     *
     * This prevents a user with an isolated
     * tracking.view permission from bypassing
     * the hierarchy.
     */
    await this.verifyTrackingAuthorityChain(user);
  }

  // ==================================================
  // TRACKING AUTHORITY CHAIN
  // ==================================================

  private async verifyTrackingAuthorityChain(user: any) {
    /*
     * HR's permission is checked above.
     *
     * Its parent hierarchy is then used
     * for actual data visibility.
     */
    let current = user;

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      const parent = await this.getUser(current.parentId);

      /*
       * Every parent must belong to
       * the same organization.
       */
      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new ForbiddenException('Invalid hierarchy');
      }

      /*
       * Reached root.
       *
       * Root is the superior authority.
       */
      if (this.isRoot(parent)) {
        return;
      }

      current = parent;
    }

    /*
     * Non-root manager/HR must ultimately
     * belong to a root hierarchy.
     */
    throw new ForbiddenException('Invalid tracking authority hierarchy');
  }

  // ==================================================
  // VERIFY EXECUTIVE
  // ==================================================

  private async verifyExecutive(
    user: any,
    executiveId: string,
    rootId: string,
    access: {
      effectiveUser: any;
      isRoot: boolean;
    }
  ) {
    const executive = await this.getUser(executiveId);

    /*
     * MOST IMPORTANT SECURITY CHECK:
     *
     * The requested target MUST be a
     * field executive.
     *
     * Therefore HR can NEVER access:
     *
     * - HR
     * - manager
     * - child_manager
     * - root
     * - admin
     */
    if (executive.role !== 'field_executive' || this.getRootId(executive) !== rootId) {
      this.logger.warn(`Invalid executive | executive=${executiveId} | user=${user.uid}`);

      throw new NotFoundException('Executive not found');
    }

    /*
     * Root can access every executive
     * in the same organization.
     */
    if (access.isRoot) {
      return;
    }

    /*
     * Manager/HR access is based on
     * the effective manager.
     *
     * For normal manager:
     *
     *   effectiveUser = manager
     *
     * For HR:
     *
     *   effectiveUser = HR parent manager
     */
    await this.verifyDescendant(access.effectiveUser.uid, executiveId);
  }

  // ==================================================
  // GET USERS
  // ==================================================

  private async getUsers(rootId: string) {
    const snapshot = await this.db
      .collection('user')
      .where('rootId', '==', rootId)
      .select('parentId', 'role', 'rootId')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];
  }

  // ==================================================
  // DESCENDANT IDS
  // ==================================================

  private getDescendantIds(userId: string, users: any[]) {
    const children = new Map<string, string[]>();

    for (const item of users) {
      if (!item.parentId) {
        continue;
      }

      if (!children.has(item.parentId)) {
        children.set(item.parentId, []);
      }

      children.get(item.parentId)!.push(item.id);
    }

    const result = new Set<string>();

    const walk = (parentId: string) => {
      for (const childId of children.get(parentId) || []) {
        result.add(childId);

        walk(childId);
      }
    };

    walk(userId);

    return result;
  }

  // ==================================================
  // VERIFY DESCENDANT
  // ==================================================

  private async verifyDescendant(parentId: string, targetId: string) {
    if (parentId === targetId) {
      throw new BadRequestException('Cannot access yourself');
    }

    const target = await this.getUser(targetId);

    /*
     * Target must be a field executive.
     *
     * This additional protection ensures
     * this method cannot accidentally be used
     * to expose managers or HR.
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
    /*
     * There is NO root_hr role.
     *
     * Root hierarchy is represented by
     * these roles only.
     */
    return ['root', 'admin', 'root_manager'].includes(user.role);
  }

  private getRootId(user: any): string {
    /*
     * Root's organization ID.
     */
    if (this.isRoot(user)) {
      return user.rootId || user.uid;
    }

    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy');
    }

    return user.rootId;
  }

  // ==================================================
  // LIVE PICK
  // ==================================================

  private pickLive(doc: FirebaseFirestore.QueryDocumentSnapshot) {
    const data = doc.data();

    return {
      id: doc.id,

      fullName: data.fullName ?? '',

      teamId: data.teamId ?? '',

      isActive: data.isActive !== false,
    };
  }

  // ==================================================
  // POLYLINE
  // ==================================================

  private decodePolyline(encoded: string): number[][] {
    if (!encoded) {
      return [];
    }

    const points: number[][] = [];

    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      // Latitude
      do {
        byte = encoded.charCodeAt(index++) - 63;

        result |= (byte & 0x1f) << shift;

        shift += 5;
      } while (byte >= 0x20);

      lat += result & 1 ? ~(result >> 1) : result >> 1;

      // Longitude
      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;

        result |= (byte & 0x1f) << shift;

        shift += 5;
      } while (byte >= 0x20);

      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
  }
}
