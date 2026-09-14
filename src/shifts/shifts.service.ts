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
    const totalStart = performance.now();

    console.log(`[SHIFT DELETE] START id=${id}`);

    const userStart = performance.now();

    const user = await this.getUser(userId);

    console.log(`[SHIFT DELETE] getUser: ${(performance.now() - userStart).toFixed(0)}ms`);

    const authStart = performance.now();

    await this.authorize(user, 'shift.delete');

    console.log(`[SHIFT DELETE] authorize: ${(performance.now() - authStart).toFixed(0)}ms`);

    const rootId = this.getRootId(user);

    const ref = this.db.collection('shifts').doc(id);

    const shiftStart = performance.now();

    const doc = await ref.get();

    console.log(`[SHIFT DELETE] shift.get: ${(performance.now() - shiftStart).toFixed(0)}ms`);

    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Shift not found');
    }

    const assignmentStart = performance.now();

    const [teams, users] = await Promise.all([
      this.db.collection('teams').where('rootId', '==', rootId).where('shiftId', '==', id).limit(1).get(),

      this.db.collection('user').where('rootId', '==', rootId).where('shiftId', '==', id).limit(1).get(),
    ]);

    console.log(`[SHIFT DELETE] team + user queries: ${(performance.now() - assignmentStart).toFixed(0)}ms`);

    if (!teams.empty || !users.empty) {
      throw new BadRequestException('Shift is assigned to a team or user');
    }

    const deleteStart = performance.now();

    await ref.delete();

    console.log(`[SHIFT DELETE] delete: ${(performance.now() - deleteStart).toFixed(0)}ms`);

    console.log(`[SHIFT DELETE] TOTAL: ${(performance.now() - totalStart).toFixed(0)}ms`);

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
    if (this.isRoot(user)) {
      return;
    }

    if (user.role === 'hr') {
      throw new BadRequestException('HR cannot manage shifts');
    }

    if (user.role === 'field_executive') {
      throw new BadRequestException('Executive has no management permission');
    }

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

      if (this.getRootId(current) !== this.getRootId(parent)) {
        throw new BadRequestException('Invalid hierarchy');
      }

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

    // ----------------------------------------------
    // Shift time
    // ----------------------------------------------

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

    // ----------------------------------------------
    // Break time
    // ----------------------------------------------

    const breakValues = [dto.breakStartHour, dto.breakStartMinute, dto.breakEndHour, dto.breakEndMinute];

    const hasBreak = breakValues.some((value) => value !== undefined && value !== null);

    const hasCompleteBreak =
      dto.breakStartHour !== undefined &&
      dto.breakStartHour !== null &&
      dto.breakStartMinute !== undefined &&
      dto.breakStartMinute !== null &&
      dto.breakEndHour !== undefined &&
      dto.breakEndHour !== null &&
      dto.breakEndMinute !== undefined &&
      dto.breakEndMinute !== null;

    /*
     * Break is optional, but if one break
     * value is supplied, all four values
     * must be supplied.
     */

    if (hasBreak && !hasCompleteBreak) {
      throw new BadRequestException('Complete break start and end time are required');
    }

    if (hasCompleteBreak) {
      if (
        dto.breakStartHour! < 0 ||
        dto.breakStartHour! > 23 ||
        dto.breakEndHour! < 0 ||
        dto.breakEndHour! > 23 ||
        dto.breakStartMinute! < 0 ||
        dto.breakStartMinute! > 59 ||
        dto.breakEndMinute! < 0 ||
        dto.breakEndMinute! > 59
      ) {
        throw new BadRequestException('Invalid break time');
      }

      const shiftStart = dto.startHour * 60 + dto.startMinute;

      const shiftEnd = dto.endHour * 60 + dto.endMinute;

      const breakStart = dto.breakStartHour! * 60 + dto.breakStartMinute!;

      const breakEnd = dto.breakEndHour! * 60 + dto.breakEndMinute!;

      if (breakStart >= breakEnd) {
        throw new BadRequestException('Break start time must be before break end time');
      }

      if (breakStart < shiftStart || breakEnd > shiftEnd) {
        throw new BadRequestException('Break time must be within shift time');
      }
    }

    // ----------------------------------------------
    // Attendance duration
    // ----------------------------------------------

    if (dto.halfDayMinutes < 0 || dto.fullDayMinutes < 0 || dto.halfDayMinutes > dto.fullDayMinutes) {
      throw new BadRequestException('Invalid attendance duration');
    }

    // ----------------------------------------------
    // Selfie Attendance
    // ----------------------------------------------

    /*
     * selfieCheckIn and selfieCheckOut
     * are validated by @IsBoolean().
     *
     * They are intentionally independent:
     *
     * Check-In  -> selfieCheckIn
     * Check-Out -> selfieCheckOut
     */
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

      breakStartHour: data.breakStartHour ?? null,

      breakStartMinute: data.breakStartMinute ?? null,

      breakEndHour: data.breakEndHour ?? null,

      breakEndMinute: data.breakEndMinute ?? null,

      graceMinutes: data.graceMinutes ?? 0,

      halfDayMinutes: data.halfDayMinutes ?? 0,

      fullDayMinutes: data.fullDayMinutes ?? 0,

      weeklyOff: data.weeklyOff ?? [],

      /*
       * Selfie Attendance
       *
       * Defaults to false so existing
       * shifts created before these fields
       * existed continue to work normally.
       */

      selfieCheckIn: data.selfieCheckIn ?? false,

      selfieCheckOut: data.selfieCheckOut ?? false,
    };
  }
}
