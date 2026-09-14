import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { TaskDto } from './dto/task.dto';

const STATUSES = ['pending', 'assigned', 'completed', 'cancelled', 'failed'];

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET ALL
  // ==================================================

  async getAll(userId: string, year: number, month: number) {
    if (!Number.isInteger(year) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month');
    }

    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const start = new Date(year, month - 1, 1);

    const end = new Date(year, month, 1);

    /*
     * --------------------------------------------------
     * LOAD TASKS + USERS + ROOT USER
     * --------------------------------------------------
     *
     * Normal users are loaded using rootId.
     *
     * Root user is loaded separately because the root
     * user's own document may not contain rootId.
     */

    const [taskSnap, userSnap, rootDoc] = await Promise.all([
      this.db
        .collection('tasks')
        .where('rootId', '==', rootId)
        .where('startDate', '>=', start)
        .where('startDate', '<', end)
        .get(),

      this.db.collection('user').where('rootId', '==', rootId).get(),

      this.db.collection('user').doc(rootId).get(),
    ]);

    /*
     * --------------------------------------------------
     * USERS
     * --------------------------------------------------
     */

    const users = userSnap.docs.map((doc) => ({
      id: doc.id,

      ...doc.data(),
    })) as any[];

    /*
     * --------------------------------------------------
     * ROOT USER
     * --------------------------------------------------
     *
     * Make sure root manager is available in the
     * user collection used by hierarchy and creator
     * name resolution.
     */

    if (rootDoc.exists && !users.some((item) => item.id === rootDoc.id)) {
      users.push({
        id: rootDoc.id,

        ...rootDoc.data(),
      });
    }

    /*
     * --------------------------------------------------
     * USER LOOKUP
     * --------------------------------------------------
     *
     * Used for:
     *
     * createdBy -> fullName
     *
     * No extra Firestore request per task.
     */

    const userMap = new Map(users.map((item) => [item.id, item]));

    /*
     * --------------------------------------------------
     * VISIBLE USERS
     * --------------------------------------------------
     *
     * Root:
     *     everyone
     *
     * Manager:
     *     self
     *     descendants
     *
     * HR:
     *     none
     *
     * Executive:
     *     self only
     */

    const visibleUsers = this.getVisibleUsers(user, users);

    const visibleIds = new Set(visibleUsers.map((item) => item.id));

    /*
     * --------------------------------------------------
     * TASKS
     * --------------------------------------------------
     */

    const tasks = taskSnap.docs
      .map((doc) => {
        const task = this.serialize(doc.data());

        /*
         * Find creator from already loaded
         * users.
         */
        if (task.createdBy == null) task.createdBy = rootId;
        const creator = task.createdBy ? userMap.get(task.createdBy) : null;

        return {
          id: doc.id,

          ...task,

          /*
           * Keep UID for backend
           * authorization.
           */

          createdBy: task.createdBy || null,

          /*
           * Display name for frontend.
           */

          createdByName: creator
            ? this.isRoot(creator)
              ? `Root - ${creator.fullName || creator.email || 'Unknown'}`
              : creator.fullName || creator.email || 'Unknown'
            : 'Unknown',
        };
      })
      .filter((task) => {
        /*
         * --------------------------------------------------
         * ROOT
         * --------------------------------------------------
         *
         * Root can see every task in
         * the organization.
         */

        if (this.isRoot(user)) {
          return true;
        }

        /*
         * --------------------------------------------------
         * FIELD EXECUTIVE
         * --------------------------------------------------
         *
         * Executive sees only tasks
         * assigned to itself.
         */

        if (user.role === 'field_executive') {
          return task.assignedTo === userId;
        }

        /*
         * --------------------------------------------------
         * HR
         * --------------------------------------------------
         *
         * HR cannot access management
         * tasks.
         */

        if (user.role === 'hr') {
          return false;
        }

        /*
         * --------------------------------------------------
         * MANAGER
         * --------------------------------------------------
         *
         * Task created by:
         *
         *     self
         *     child manager
         *     deeper descendant
         */

        if (task.createdBy && visibleIds.has(task.createdBy)) {
          return true;
        }

        /*
         * --------------------------------------------------
         * ASSIGNED EXECUTIVE
         * --------------------------------------------------
         *
         * Task assigned to an executive
         * inside manager hierarchy.
         */

        if (task.assignedTo && visibleIds.has(task.assignedTo)) {
          return true;
        }

        return false;
      });

    /*
     * --------------------------------------------------
     * EXECUTIVES
     * --------------------------------------------------
     */

    const executives = visibleUsers
      .filter((item) => item.role === 'field_executive')
      .map((item) => ({
        id: item.id,

        fullName: item.fullName ?? '',

        email: item.email ?? '',
      }));

    /*
     * --------------------------------------------------
     * MANAGERS
     * --------------------------------------------------
     */

    const managers = visibleUsers
      .filter((item) => ['manager', 'child_manager'].includes(item.role))
      .map((item) => ({
        id: item.id,

        fullName: item.fullName ?? '',

        parentId: item.parentId ?? null,
      }));

    /*
     * --------------------------------------------------
     * RESPONSE
     * --------------------------------------------------
     */

    return {
      tasks,

      executives,

      managers,
    };
  }

  // ==================================================
  // CREATE
  // ==================================================

  async create(userId: string, dto: TaskDto) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    this.validate(dto);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid schedule');
    }

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    let assignedTo: string | null = null;

    /*
     * --------------------------------------------------
     * EXECUTIVE
     * --------------------------------------------------
     */

    if (user.role === 'field_executive') {
      await this.authorize(user, 'task.create');

      /*
       * Executive can only create a task for itself.
       */
      assignedTo = userId;
    }

    /*
     * --------------------------------------------------
     * MANAGER / ROOT
     * --------------------------------------------------
     */
    else {
      await this.authorize(user, 'task.create');

      assignedTo = dto.assignedTo || null;

      if (assignedTo) {
        await this.verifyExecutive(user, assignedTo);
      }
    }

    const now = new Date();

    const ref = await this.db.collection('tasks').add({
      title: dto.title.trim(),
      description: dto.description.trim(),
      rootId,
      createdBy: userId,
      assignedTo,
      status: 'pending',
      priority: dto.priority,
      startDate,
      endDate,
      isGeofence: dto.isGeofence === true,
      startLocation: dto.startLocation || null,
      endLocation: dto.endLocation || null,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.log(
      `Task created | id=${ref.id} | creator=${userId} | assignedTo=${assignedTo ?? 'none'} | root=${rootId}`
    );

    return {
      success: true,
      id: ref.id,
    };
  }

  // ==================================================
  // UPDATE
  // ==================================================

  async update(userId: string, id: string, dto: Partial<TaskDto>) {
    const user = await this.getUser(userId);

    await this.authorize(user, 'task.edit');

    const rootId = this.getRootId(user);

    const ref = this.db.collection('tasks').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Task not found');
    }

    const task = doc.data()!;

    /*
     * Hierarchy access.
     */
    if (!this.isRoot(user)) {
      await this.verifyTaskAccess(user, task);
    }

    const status = task.status || 'pending';

    if (['completed', 'cancelled', 'failed'].includes(status)) {
      throw new BadRequestException('Completed, cancelled or failed tasks cannot be edited');
    }

    const data: any = {};

    // --------------------------------------------------
    // TITLE
    // --------------------------------------------------

    if (dto.title !== undefined) {
      if (!dto.title.trim()) {
        throw new BadRequestException('Title is required');
      }

      data.title = dto.title.trim();
    }

    // --------------------------------------------------
    // DESCRIPTION
    // --------------------------------------------------

    if (dto.description !== undefined) {
      if (!dto.description.trim()) {
        throw new BadRequestException('Description is required');
      }

      data.description = dto.description.trim();
    }

    // --------------------------------------------------
    // PRIORITY
    // --------------------------------------------------

    if (dto.priority !== undefined) {
      if (!['Low', 'Medium', 'High'].includes(dto.priority)) {
        throw new BadRequestException('Invalid priority');
      }

      data.priority = dto.priority;
    }

    // --------------------------------------------------
    // START
    // --------------------------------------------------

    if (dto.startDate !== undefined) {
      const date = new Date(dto.startDate);

      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid start date');
      }

      data.startDate = date;
    }

    // --------------------------------------------------
    // END
    // --------------------------------------------------

    if (dto.endDate !== undefined) {
      const date = new Date(dto.endDate);

      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid end date');
      }

      data.endDate = date;
    }

    const startDate = data.startDate || task.startDate;

    const endDate = data.endDate || task.endDate;

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // --------------------------------------------------
    // ASSIGNMENT
    // --------------------------------------------------

    if (dto.assignedTo !== undefined) {
      if (dto.assignedTo) {
        /*
         * IMPORTANT:
         *
         * Do NOT use verifyExecutive(user, ...)
         * here.
         *
         * The current user may be the parent of
         * the original creator.
         *
         * Assignment must remain inside the
         * original creator's branch.
         */
        await this.verifyTaskAssignment(user, task, dto.assignedTo);
      }

      data.assignedTo = dto.assignedTo || null;

      if (status === 'assigned') {
        data.status = 'pending';
      }
    }

    // --------------------------------------------------
    // GEOFENCE
    // --------------------------------------------------

    if (dto.isGeofence !== undefined) {
      data.isGeofence = dto.isGeofence;
    }

    if (dto.startLocation !== undefined) {
      data.startLocation = dto.startLocation;
    }

    if (dto.endLocation !== undefined) {
      data.endLocation = dto.endLocation;
    }

    data.updatedAt = new Date();

    await ref.update(data);

    this.logger.log(`Task updated | id=${id} | user=${userId}`);

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // DELETE
  // ==================================================

  async remove(userId: string, id: string) {
    const user = await this.getUser(userId);

    await this.authorize(user, 'task.delete');

    const rootId = this.getRootId(user);

    const ref = this.db.collection('tasks').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Task not found');
    }

    if (!this.isRoot(user)) {
      await this.verifyTaskAccess(user, doc.data());
    }

    await ref.delete();

    this.logger.log(`Task deleted | id=${id} | user=${userId}`);

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // STATUS
  // ==================================================

  async updateStatus(userId: string, id: string, status: string) {
    if (!STATUSES.includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const ref = this.db.collection('tasks').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Task not found');
    }

    const task = doc.data()!;

    /*
     * Executive:
     *
     * only own assigned task.
     */
    if (user.role === 'field_executive') {
      if (task.assignedTo !== userId) {
        throw new NotFoundException('Task not found');
      }
    } else {
      /*
       * Managers need permission.
       */
      await this.authorize(user, 'task.status');

      /*
       * Manager can only change
       * status of hierarchy task.
       */
      if (!this.isRoot(user)) {
        await this.verifyTaskAccess(user, task);
      }
    }

    await ref.update({
      status,

      updatedAt: new Date(),
    });

    return {
      success: true,

      id,
    };
  }

  // ==================================================
  // VERIFY EXECUTIVE
  // ==================================================

  private async verifyExecutive(user: any, executiveId: string) {
    const target = await this.getUser(executiveId);

    if (target.role !== 'field_executive') {
      throw new BadRequestException('Invalid executive');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(user) !== this.getRootId(target)) {
      throw new BadRequestException('Invalid executive');
    }

    /*
     * Root can assign to
     * anyone in organization.
     */
    if (this.isRoot(user)) {
      return;
    }

    /*
     * HR cannot assign tasks.
     */
    if (user.role === 'hr') {
      throw new BadRequestException('HR cannot manage field executives');
    }

    /*
     * Executive cannot
     * assign tasks.
     */
    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive cannot assign tasks');
    }

    /*
     * Manager can assign only
     * to descendant executives.
     */
    await this.verifyDescendant(user.uid, executiveId);
  }

  // ==================================================
  // VERIFY TASK ASSIGNMENT
  // ==================================================

  private async verifyTaskAssignment(user: any, task: any, executiveId: string) {
    /*
     * Target must be an executive.
     */
    const target = await this.getUser(executiveId);

    if (target.role !== 'field_executive') {
      throw new BadRequestException('Invalid executive');
    }

    /*
     * Same organization.
     */
    if (this.getRootId(user) !== this.getRootId(target)) {
      throw new BadRequestException('Invalid executive');
    }

    /*
     * Root has organization-wide authority.
     */
    if (this.isRoot(user)) {
      return;
    }

    /*
     * HR cannot assign tasks.
     */
    if (user.role === 'hr') {
      throw new BadRequestException('HR cannot manage field executives');
    }

    /*
     * Executive cannot assign tasks.
     */
    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive cannot assign tasks');
    }

    /*
     * --------------------------------------------------
     * TASK CREATOR IS THE SECURITY ANCHOR
     * --------------------------------------------------
     *
     * If Manager A1 creates the task:
     *
     * Manager A
     *    └── Manager A1
     *          ├── Executive A1-1
     *          └── Executive A1-2
     *
     * Manager A may edit the task.
     *
     * BUT Manager A may only assign
     * the task to:
     *
     *     Executive A1-1
     *     Executive A1-2
     *
     * NOT:
     *
     *     Manager A's other executives
     *     Manager B's executives
     */

    const creatorId = task.createdBy;

    if (!creatorId) {
      throw new BadRequestException('Task creator is missing');
    }

    const creator = await this.getUser(creatorId);

    /*
     * Root-created task.
     *
     * Root owns the whole organization,
     * but a non-root manager editing the
     * task is still restricted to their
     * own descendants.
     */
    if (this.isRoot(creator)) {
      await this.verifyDescendant(user.uid, executiveId);

      return;
    }

    /*
     * Task created by a manager.
     *
     * Assignment scope is permanently
     * anchored to that manager's branch.
     */
    await this.verifyDescendant(creatorId, executiveId);
  }

  // ==================================================
  // TASK ACCESS
  // ==================================================

  private async verifyTaskAccess(user: any, task: any) {
    /*
     * Creator always has access.
     */
    if (task.createdBy === user.uid) {
      return;
    }

    /*
     * Parent of creator can access
     * the task, even when unassigned.
     */
    if (task.createdBy && (await this.isDescendant(user.uid, task.createdBy))) {
      return;
    }

    /*
     * Assigned executive belongs
     * to requester's hierarchy.
     */
    if (task.assignedTo && (await this.isDescendant(user.uid, task.assignedTo))) {
      return;
    }

    throw new NotFoundException('Task not found');
  }

  private async isDescendant(parentId: string, targetId: string): Promise<boolean> {
    if (parentId === targetId) {
      return false;
    }

    const parent = await this.getUser(parentId);

    const target = await this.getUser(targetId);

    if (this.getRootId(parent) !== this.getRootId(target)) {
      return false;
    }

    let current = target;

    const visited = new Set<string>();

    while (current.parentId && !visited.has(current.uid)) {
      visited.add(current.uid);

      if (current.parentId === parentId) {
        return true;
      }

      current = await this.getUser(current.parentId);
    }

    return false;
  }

  // ==================================================
  // VISIBLE USERS
  // ==================================================

  private getVisibleUsers(user: any, users: any[]) {
    /*
     * Root sees everyone.
     */
    if (this.isRoot(user)) {
      return users;
    }

    /*
     * HR has no manager hierarchy
     * for task management.
     */
    if (user.role === 'hr') {
      return [];
    }

    /*
     * Executive only sees itself.
     */
    if (user.role === 'field_executive') {
      return users.filter((item) => item.id === user.uid);
    }

    /*
     * --------------------------------------------------
     * MANAGER HIERARCHY
     * --------------------------------------------------
     *
     * Include SELF first.
     *
     * Then recursively include
     * every descendant.
     */

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

    const result: any[] = [];

    /*
     * Important:
     * Include logged-in manager.
     */
    const self = users.find((item) => item.id === user.uid);

    if (self) {
      result.push(self);
    }

    const visited = new Set<string>();

    const walk = (parentId: string) => {
      if (visited.has(parentId)) {
        return;
      }

      visited.add(parentId);

      for (const child of children.get(parentId) || []) {
        result.push(child);

        walk(child.id);
      }
    };

    walk(user.uid);

    return result;
  }

  // ==================================================
  // DESCENDANT
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
      throw new NotFoundException('Resource not found');
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

    throw new NotFoundException('Resource not found');
  }

  // ==================================================
  // AUTHORIZATION
  // ==================================================

  private async authorize(user: any, permission: string) {
    // Root manager has unrestricted access.
    if (this.isRoot(user)) {
      return;
    }

    // HR cannot manage tasks.
    if (user.role === 'hr') {
      throw new BadRequestException('HR cannot manage tasks');
    }

    // Executives can manage only their own task actions
    // when explicitly granted the corresponding permission.
    if (user.role === 'field_executive') {
      if (!['task.create', 'task.edit', 'task.delete'].includes(permission)) {
        throw new BadRequestException('Executive has no management permission');
      }

      const permissions = await this.getPermissions(user.uid);

      if (permissions[permission] !== true) {
        throw new BadRequestException('Permission denied');
      }

      // Important:
      // still verify that the executive's parent hierarchy
      // has this permission.
      await this.verifyAuthorityChain(user, permission);

      return;
    }

    // Manager / child manager flow.
    const permissions = await this.getPermissions(user.uid);

    if (permissions[permission] !== true) {
      throw new BadRequestException('Permission denied');
    }

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

      /*
       * Prevent broken hierarchy
       * crossing organizations.
       */
      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new BadRequestException('Invalid hierarchy');
      }

      /*
       * Root terminates
       * authority chain.
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
    /*
     * Root:
     * rootId may be itself or
     * explicitly stored.
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
  // VALIDATION
  // ==================================================

  private validate(dto: TaskDto) {
    if (!dto.title?.trim()) {
      throw new BadRequestException('Title is required');
    }

    if (!dto.description?.trim()) {
      throw new BadRequestException('Description is required');
    }

    if (!['Low', 'Medium', 'High'].includes(dto.priority)) {
      throw new BadRequestException('Invalid priority');
    }

    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException('Schedule is required');
    }
  }

  // ==================================================
  // SERIALIZE
  // ==================================================

  private serialize(data: any) {
    const date = (value: any) => value?.toDate?.() ?? value ?? null;

    return {
      ...data,

      startDate: date(data.startDate),

      endDate: date(data.endDate),

      createdAt: date(data.createdAt),

      updatedAt: date(data.updatedAt),

      startedAt: date(data.startedAt),

      completedAt: date(data.completedAt),
    };
  }
}
