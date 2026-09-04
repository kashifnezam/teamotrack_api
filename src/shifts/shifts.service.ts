import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET ALL
  // ==================================================

  async getAll(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    try {
      const snap = await this.db.collection('shifts').where('rootId', '==', rootId).orderBy('createdAt', 'desc').get();

      return {
        shifts: snap.docs.map((doc) => ({
          id: doc.id,
          ...this.pick(doc.data()),
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch shifts | user=${userId}`, error instanceof Error ? error.stack : undefined);

      throw error;
    }
  }

  // ==================================================
  // CREATE
  // ==================================================

  async create(userId: string, dto: ShiftDto) {
    const user = await this.getUser(userId);

    await this.authorize(user, 'shift.create');

    this.validate(dto);

    const rootId = this.getRootId(user);

    const ref = await this.db.collection('shifts').add({
      ...dto,

      rootId,

      createdAt: new Date(),

      updatedAt: new Date(),
    });

    this.logger.log(`Shift created | id=${ref.id} | user=${userId}`);

    return {
      success: true,
      id: ref.id,
    };
  }

  // ==================================================
  // UPDATE
  // ==================================================

  async update(userId: string, id: string, dto: ShiftDto) {
    const user = await this.getUser(userId);

    await this.authorize(user, 'shift.edit');

    this.validate(dto);

    const rootId = this.getRootId(user);

    const ref = this.db.collection('shifts').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Shift not found');
    }

    await ref.update({
      ...dto,

      updatedAt: new Date(),
    });

    this.logger.log(`Shift updated | id=${id} | user=${userId}`);

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

    await this.authorize(user, 'shift.delete');

    const rootId = this.getRootId(user);

    const ref = this.db.collection('shifts').doc(id);

    const doc = await ref.get();

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Shift not found');
    }

    /*
     * Prevent deleting an assigned shift.
     */
    const teams = await this.db
      .collection('teams')
      .where('rootId', '==', rootId)
      .where('shiftId', '==', id)
      .limit(1)
      .get();

    if (!teams.empty) {
      throw new BadRequestException('Shift is assigned to a team');
    }

    await ref.delete();

    this.logger.log(`Shift deleted | id=${id} | user=${userId}`);

    return {
      success: true,
      id,
    };
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
     * HR does not manage
     * organizational shift configuration.
     */
    if (user.role === 'hr') {
      throw new BadRequestException('HR cannot manage shifts');
    }

    /*
     * Field Executive cannot
     * manage anything.
     */
    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

    /*
     * Manager permission.
     */
    const permissions = await this.getPermissions(user.uid);

    if (permissions[permission] !== true) {
      throw new BadRequestException('Permission denied');
    }

    /*
     * Parent authority must also
     * contain the same permission.
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
       * Root authority ends
       * the chain.
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
    if (this.isRoot(user)) {
      return user.rootId || user.uid;
    }

    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy');
    }

    return user.rootId;
  }

  // ==================================================
  // VALIDATE
  // ==================================================

  private validate(dto: ShiftDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Shift name is required');
    }

    if (
      dto.startHour < 0 ||
      dto.startHour > 23 ||
      dto.endHour < 0 ||
      dto.endHour > 23 ||
      dto.startMinute < 0 ||
      dto.startMinute > 59 ||
      dto.endMinute < 0 ||
      dto.endMinute > 59
    ) {
      throw new BadRequestException('Invalid shift time');
    }

    if (dto.halfDayMinutes < 0 || dto.fullDayMinutes < 0 || dto.halfDayMinutes > dto.fullDayMinutes) {
      throw new BadRequestException('Invalid attendance duration');
    }
  }

  // ==================================================
  // PICK
  // ==================================================

  private pick(data: any) {
    return {
      name: data.name ?? '',

      startHour: data.startHour ?? 0,

      startMinute: data.startMinute ?? 0,

      endHour: data.endHour ?? 0,

      endMinute: data.endMinute ?? 0,

      graceMinutes: data.graceMinutes ?? 0,

      halfDayMinutes: data.halfDayMinutes ?? 0,

      fullDayMinutes: data.fullDayMinutes ?? 0,

      weeklyOff: data.weeklyOff ?? [],
    };
  }
}
