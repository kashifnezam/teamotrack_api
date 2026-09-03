import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { HolidayDto } from './dto/holiday.dto';

@Injectable()
export class HolidayService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
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
    /*
     * Root-level users own the
     * organization.
     */
    if (this.isRoot(user)) {
      return user.uid;
    }

    if (!user.rootId) {
      throw new BadRequestException('Invalid hierarchy');
    }

    return user.rootId;
  }

  // ==================================================
  // HOLIDAY MANAGER
  // ==================================================

  private isHolidayManager(user: any) {
    return ['root_manager', 'root_hr'].includes(user.role);
  }

  private async authorizeManager(uid: string) {
    const user = await this.getUser(uid);

    /*
     * IMPORTANT:
     *
     * Holiday management is NOT
     * manager-hierarchy based.
     *
     * Only root_manager and
     * root_hr can manage holidays.
     */
    if (!this.isHolidayManager(user)) {
      throw new BadRequestException('Permission denied');
    }

    return {
      user,

      rootId: this.getRootId(user),
    };
  }

  // ==================================================
  // NORMALIZE NAME
  // ==================================================

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // ==================================================
  // DATE
  // ==================================================

  private validateDate(date: string) {
    if (!date) {
      throw new BadRequestException('Holiday date is required');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid holiday date');
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Invalid holiday date');
    }
  }

  // ==================================================
  // HOLIDAY
  // ==================================================

  private async getHoliday(rootId: string, id: string) {
    const doc = await this.db.collection('companyHolidays').doc(id).get();

    /*
     * IMPORTANT:
     *
     * Never allow a holiday from
     * another organization.
     */
    if (!doc.exists || doc.data()?.rootId !== rootId) {
      throw new NotFoundException('Holiday not found');
    }

    return {
      id: doc.id,

      ...doc.data(),
    } as any;
  }

  // ==================================================
  // DUPLICATE
  // ==================================================

  private async checkDuplicate(rootId: string, date: string, name: string, excludeId?: string) {
    const snap = await this.db
      .collection('companyHolidays')
      .where('rootId', '==', rootId)
      .where('date', '==', date)
      .get();

    const normalizedName = this.normalizeName(name);

    const duplicate = snap.docs.some((doc) => {
      if (excludeId && doc.id === excludeId) {
        return false;
      }

      return this.normalizeName(doc.data().name || '') === normalizedName;
    });

    if (duplicate) {
      throw new BadRequestException('Holiday already exists');
    }
  }

  // ==================================================
  // GET ALL
  // ==================================================

  async getAll(userId: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    const snap = await this.db.collection('companyHolidays').where('rootId', '==', rootId).get();

    return snap.docs

      .map((doc) => ({
        id: doc.id,

        ...doc.data(),
      }))

      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  // ==================================================
  // GET RANGE
  // ==================================================

  async getRange(userId: string, startDate: string, endDate: string) {
    const user = await this.getUser(userId);

    const rootId = this.getRootId(user);

    this.validateDate(startDate);

    this.validateDate(endDate);

    if (startDate > endDate) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    const snap = await this.db
      .collection('companyHolidays')
      .where('rootId', '==', rootId)
      .where('active', '==', true)
      .get();

    const holidays = snap.docs

      .map((doc) => ({
        id: doc.id,

        ...doc.data(),
      }))

      .filter((holiday: any) => holiday.date >= startDate && holiday.date <= endDate)

      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    return {
      holidays,
    };
  }

  // ==================================================
  // MANAGEABLE
  // ==================================================

  async getManageable(userId: string) {
    const { rootId } = await this.authorizeManager(userId);

    const snap = await this.db.collection('companyHolidays').where('rootId', '==', rootId).get();

    return snap.docs

      .map((doc) => ({
        id: doc.id,

        ...doc.data(),
      }))

      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  // ==================================================
  // CREATE
  // ==================================================

  async create(userId: string, dto: HolidayDto) {
    const { user, rootId } = await this.authorizeManager(userId);

    if (!dto.name?.trim()) {
      throw new BadRequestException('Holiday name is required');
    }

    this.validateDate(dto.date);

    const name = dto.name.trim();

    const date = dto.date;

    await this.checkDuplicate(rootId, date, name);

    const now = new Date();

    const data = {
      rootId,

      name,

      date,

      type: dto.type?.trim() || 'public',

      isOptional: dto.isOptional ?? false,

      description: dto.description?.trim() || '',

      active: true,

      createdBy: user.uid,

      createdAt: now,

      updatedAt: now,
    };

    const ref = await this.db.collection('companyHolidays').add(data);

    return {
      id: ref.id,

      ...data,
    };
  }

  // ==================================================
  // UPDATE
  // ==================================================

  async update(userId: string, id: string, dto: HolidayDto) {
    const { rootId } = await this.authorizeManager(userId);

    const holiday = await this.getHoliday(rootId, id);

    if (!dto.name?.trim()) {
      throw new BadRequestException('Holiday name is required');
    }

    this.validateDate(dto.date);

    const name = dto.name.trim();

    const date = dto.date;

    await this.checkDuplicate(rootId, date, name, id);

    const data = {
      name,

      date,

      type: dto.type?.trim() || 'public',

      isOptional: dto.isOptional ?? false,

      description: dto.description?.trim() || '',

      updatedAt: new Date(),
    };

    await this.db.collection('companyHolidays').doc(id).update(data);

    return {
      id: holiday.id,

      ...holiday,

      ...data,
    };
  }

  // ==================================================
  // DEACTIVATE
  // ==================================================

  async deactivate(userId: string, id: string) {
    const { rootId } = await this.authorizeManager(userId);

    const holiday = await this.getHoliday(rootId, id);

    if (!holiday.active) {
      throw new BadRequestException('Holiday is already inactive');
    }

    await this.db.collection('companyHolidays').doc(id).update({
      active: false,

      updatedAt: new Date(),
    });

    return {
      id,

      active: false,
    };
  }

  // ==================================================
  // REACTIVATE
  // ==================================================

  async reactivate(userId: string, id: string) {
    const { rootId } = await this.authorizeManager(userId);

    const holiday = await this.getHoliday(rootId, id);

    if (holiday.active) {
      throw new BadRequestException('Holiday is already active');
    }

    await this.checkDuplicate(rootId, holiday.date, holiday.name, id);

    await this.db.collection('companyHolidays').doc(id).update({
      active: true,

      updatedAt: new Date(),
    });

    return {
      id,

      active: true,
    };
  }
}
