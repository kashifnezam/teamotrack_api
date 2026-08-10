import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }

    async getAll(rootId: string) {

        const snap = await this.db
            .collection('shifts')
            .where('rootId', '==', rootId)
            .orderBy('createdAt', 'desc')
            .get();

        return {
            shifts: snap.docs.map(doc => ({
                id: doc.id,
                ...this.pick(doc.data()),
            })),
        };
    }

    async create(
        rootId: string,
        dto: ShiftDto,
    ) {

        this.validate(dto);

        const ref = await this.db
            .collection('shifts')
            .add({
                ...dto,
                rootId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        return {
            success: true,
            id: ref.id,
        };
    }

    async update(
        rootId: string,
        id: string,
        dto: ShiftDto,
    ) {

        this.validate(dto);

        const ref = this.db
            .collection('shifts')
            .doc(id);

        const doc = await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {
            throw new NotFoundException(
                'Shift not found',
            );
        }

        await ref.update({
            ...dto,
            updatedAt: new Date(),
        });

        return {
            success: true,
            id,
        };
    }

    async remove(
        rootId: string,
        id: string,
    ) {

        const ref = this.db
            .collection('shifts')
            .doc(id);

        const doc = await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {
            throw new NotFoundException(
                'Shift not found',
            );
        }

        // Prevent deleting a shift assigned to teams
        const teams = await this.db
            .collection('teams')
            .where('rootId', '==', rootId)
            .where('shiftId', '==', id)
            .limit(1)
            .get();

        if (!teams.empty) {
            throw new BadRequestException(
                'Shift is assigned to a team',
            );
        }

        await ref.delete();

        return {
            success: true,
            id,
        };
    }

    private validate(dto: ShiftDto) {

        if (!dto.name?.trim()) {
            throw new BadRequestException(
                'Shift name is required',
            );
        }

        if (
            dto.startHour > 23 ||
            dto.endHour > 23 ||
            dto.startMinute > 59 ||
            dto.endMinute > 59
        ) {
            throw new BadRequestException(
                'Invalid shift time',
            );
        }

        if (dto.halfDayMinutes > dto.fullDayMinutes) {
            throw new BadRequestException(
                'Invalid attendance duration',
            );
        }
    }

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