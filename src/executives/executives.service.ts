import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ExecutiveDto } from './dto/executive.dto';

@Injectable()
export class ExecutivesService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }

    async getAll(rootId: string) {

    const [execSnap, teamSnap] = await Promise.all([

        this.db
            .collection('user')
            .where('role', '==', 'field_executive')
            .where('rootId', '==', rootId)
            .select(
                'fullName',
                'mobile',
                'email',
                'teamId',
                'isActive',
                'isTrackingEnable',
                'gpsPriority',
            )
            .get(),

        this.db
            .collection('teams')
            .where('rootId', '==', rootId)
            .select('name')
            .get(),

    ]);


    return {

        executives: execSnap.docs.map(doc => {

            const data = doc.data();

            return {
                id: doc.id,
                fullName: data.fullName ?? '',
                mobile: data.mobile ?? '',
                email: data.email ?? '',
                teamId: data.teamId ?? '',
                isActive: data.isActive !== false,
                isTrackingEnable:
                    data.isTrackingEnable === true,
                gpsPriority:
                    data.gpsPriority ?? 'low',
            };

        }),


        teams: teamSnap.docs.map(doc => ({

            id: doc.id,
            name: doc.data().name ?? '',

        })),

    };

}

    async create(rootId: string, dto: ExecutiveDto) {

        if (!dto.email || !dto.password) {
            throw new BadRequestException(
                'Email and password are required',
            );
        }

        // 🔐 Verify team belongs to this root
        await this.verifyTeam(rootId, dto.teamId);

        const user = await this.firebase.auth.createUser({
            email: dto.email,
            password: dto.password,
        });

        try {

            await this.db.collection('user').doc(user.uid).set({
                uid: user.uid,
                email: dto.email,
                fullName: dto.fullName,
                mobile: dto.mobile,
                teamId: dto.teamId,
                rootId,
                role: 'field_executive',
                isActive: dto.isActive,
                isTrackingEnable: dto.isTrackingEnable,
                gpsPriority: dto.gpsPriority ?? 'low',
                createdAt: new Date(),
            });

        } catch (error) {

            // Roll back Firebase Auth user if Firestore fails
            await this.firebase.auth.deleteUser(user.uid);

            throw error;
        }

        return {
            success: true,
            id: user.uid,
        };
    }

    async update(
        rootId: string,
        id: string,
        dto: ExecutiveDto,
    ) {

        const ref = this.db.collection('user').doc(id);
        const doc = await ref.get();

        // 🔐 Executive ownership check
        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId ||
            doc.data()?.role !== 'field_executive'
        ) {
            throw new NotFoundException(
                'Executive not found',
            );
        }

        // 🔐 Team ownership check
        await this.verifyTeam(rootId, dto.teamId);

        await ref.update({
            fullName: dto.fullName,
            mobile: dto.mobile,
            teamId: dto.teamId,
            isActive: dto.isActive,
            isTrackingEnable: dto.isTrackingEnable,
            gpsPriority: dto.gpsPriority ?? 'low',
            updatedAt: new Date(),
        });

        if (dto.password) {
            await this.firebase.auth.updateUser(id, {
                password: dto.password,
            });
        }

        return {
            success: true,
            id,
        };
    }

    private async verifyTeam(
        rootId: string,
        teamId: string,
    ) {

        const team = await this.db
            .collection('teams')
            .doc(teamId)
            .get();

        if (
            !team.exists ||
            team.data()?.rootId !== rootId
        ) {
            throw new BadRequestException(
                'Invalid team',
            );
        }
    }

    private pick(data: any) {

        return {
            fullName: data.fullName ?? '',
            mobile: data.mobile ?? '',
            email: data.email ?? '',
            teamId: data.teamId ?? '',
            isActive: data.isActive !== false,
            isTrackingEnable: data.isTrackingEnable === true,
            gpsPriority: data.gpsPriority ?? 'low',
        };
    }
}