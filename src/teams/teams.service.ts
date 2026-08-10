import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { TeamDto } from './dto/team.dto';

@Injectable()
export class TeamsService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }

    async getAll(rootId: string) {

    const [teamSnap, managerSnap, shiftSnap, execSnap] =
        await Promise.all([

            this.db.collection('teams')
                .where('rootId', '==', rootId)
                .get(),

            this.db.collection('user')
                .where('role', '==', 'child_manager')
                .where('reportsTo', '==', rootId)
                .get(),

            this.db.collection('shifts')
                .where('rootId', '==', rootId)
                .get(),

            this.db.collection('user')
                .where('role', '==', 'field_executive')
                .where('rootId', '==', rootId)
                .get(),
        ]);

    // Count executives by team
    const counts: Record<string, number> = {};

    execSnap.docs.forEach(doc => {

        const teamId = doc.data().teamId;

        if (teamId) {
            counts[teamId] = (counts[teamId] || 0) + 1;
        }

    });

    return {

        teams: teamSnap.docs.map(doc => {

            const data = doc.data();

            return {
                id: doc.id,
                name: data.name ?? '',
                leadId: data.leadId ?? '',
                shiftId: data.shiftId ?? '',

                totalExecutives:
                    counts[doc.id] || 0,
            };

        }),

        managers: managerSnap.docs.map(doc => ({
            id: doc.id,
            fullName: doc.data().fullName ?? '',
        })),

        shifts: shiftSnap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name ?? '',
        })),

    };
}

    async create(rootId: string, dto: TeamDto) {

        this.validate(dto);

        await this.verifyShift(rootId, dto.shiftId);
        await this.verifyManager(rootId, dto.leadId);

        const ref = await this.db.collection('teams').add({
            name: dto.name.trim(),
            rootId,
            leadId: dto.leadId || null,
            shiftId: dto.shiftId,
            totalExecutives: 0,
            activeToday: 0,
            createdAt: new Date(),
        });

        return {
            success: true,
            id: ref.id,
        };
    }

    async update(
        rootId: string,
        id: string,
        dto: TeamDto,
    ) {

        this.validate(dto);

        const ref = this.db.collection('teams').doc(id);
        const doc = await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {
            throw new NotFoundException('Team not found');
        }

        await this.verifyShift(rootId, dto.shiftId);
        await this.verifyManager(rootId, dto.leadId);

        await ref.update({
            name: dto.name.trim(),
            leadId: dto.leadId || null,
            shiftId: dto.shiftId,
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

        const ref = this.db.collection('teams').doc(id);
        const team = await ref.get();

        if (
            !team.exists ||
            team.data()?.rootId !== rootId
        ) {
            throw new NotFoundException('Team not found');
        }

        const executives = await this.db
            .collection('user')
            .where('rootId', '==', rootId)
            .where('teamId', '==', id)
            .limit(1)
            .get();

        if (!executives.empty) {
            throw new BadRequestException(
                'Executives are attached to this team',
            );
        }

        await ref.delete();

        return {
            success: true,
            id,
        };
    }

    private validate(dto: TeamDto) {

        if (!dto.name?.trim()) {
            throw new BadRequestException(
                'Team name is required',
            );
        }

        if (!dto.shiftId) {
            throw new BadRequestException(
                'Shift policy is required',
            );
        }
    }

    private async verifyShift(
        rootId: string,
        shiftId?: string,
    ) {

        if (!shiftId) return;

        const doc = await this.db
            .collection('shifts')
            .doc(shiftId)
            .get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {
            throw new BadRequestException(
                'Invalid shift',
            );
        }
    }

    private async verifyManager(
        rootId: string,
        managerId?: string,
    ) {

        if (!managerId) return;

        const doc = await this.db
            .collection('user')
            .doc(managerId)
            .get();

        if (
            !doc.exists ||
            doc.data()?.role !== 'child_manager' ||
            doc.data()?.reportsTo !== rootId
        ) {
            throw new BadRequestException(
                'Invalid manager',
            );
        }
    }

    private pickTeam(data: any) {

        return {
            name: data.name ?? '',
            leadId: data.leadId ?? '',
            shiftId: data.shiftId ?? '',
            totalExecutives: data.totalExecutives ?? 0,
            activeToday: data.activeToday ?? 0,
        };
    }
}