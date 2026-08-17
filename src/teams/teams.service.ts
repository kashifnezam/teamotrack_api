import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { TeamDto } from './dto/team.dto';

@Injectable()
export class TeamsService {

    private readonly logger =
        new Logger(TeamsService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET ALL
    // ==================================================

    async getAll(rootId: string) {

        this.logger.log(
            `Fetching teams | rootId=${rootId}`,
        );

        const [
            teamSnap,
            managerSnap,
            shiftSnap,
            execSnap,
        ] = await Promise.all([

            this.db
                .collection('teams')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get(),

            this.db
                .collection('user')
                .where(
                    'role',
                    '==',
                    'child_manager',
                )
                .where(
                    'reportsTo',
                    '==',
                    rootId,
                )
                .get(),

            this.db
                .collection('shifts')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get(),

            this.db
                .collection('user')
                .where(
                    'role',
                    '==',
                    'field_executive',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get(),

        ]);

        const counts: Record<string, number> = {};

        execSnap.docs.forEach(doc => {

            const teamId =
                doc.data().teamId;

            if (teamId) {
                counts[teamId] =
                    (counts[teamId] || 0) + 1;
            }

        });

        this.logger.log(
            `Teams fetched | rootId=${rootId} | teams=${teamSnap.size} | managers=${managerSnap.size} | shifts=${shiftSnap.size} | executives=${execSnap.size}`,
        );

        return {

            teams:
                teamSnap.docs.map(doc => {

                    const data =
                        doc.data();

                    return {

                        id: doc.id,

                        name:
                            data.name ?? '',

                        leadId:
                            data.leadId ?? '',

                        shiftId:
                            data.shiftId ?? '',

                        totalExecutives:
                            counts[doc.id] || 0,

                    };

                }),

            managers:
                managerSnap.docs.map(doc => ({

                    id: doc.id,

                    fullName:
                        doc.data().fullName ?? '',

                })),

            shifts:
                shiftSnap.docs.map(doc => ({

                    id: doc.id,

                    name:
                        doc.data().name ?? '',

                })),

        };
    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        rootId: string,
        dto: TeamDto,
    ) {

        this.logger.log(
            `Creating team | rootId=${rootId} | name=${dto.name}`,
        );

        this.validate(dto);

        await this.verifyShift(
            rootId,
            dto.shiftId,
        );

        await this.verifyManager(
            rootId,
            dto.leadId,
        );

        const ref =
            await this.db
                .collection('teams')
                .add({

                    name:
                        dto.name.trim(),

                    rootId,

                    leadId:
                        dto.leadId || null,

                    shiftId:
                        dto.shiftId,

                    totalExecutives: 0,

                    activeToday: 0,

                    createdAt:
                        new Date(),

                });

        this.logger.log(
            `Team created | id=${ref.id} | rootId=${rootId}`,
        );

        return {
            success: true,
            id: ref.id,
        };
    }


    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        rootId: string,
        id: string,
        dto: TeamDto,
    ) {

        this.logger.log(
            `Updating team | id=${id} | rootId=${rootId}`,
        );

        this.validate(dto);

        const ref =
            this.db
                .collection('teams')
                .doc(id);

        const doc =
            await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Team not found | id=${id} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Team not found',
            );
        }

        await this.verifyShift(
            rootId,
            dto.shiftId,
        );

        await this.verifyManager(
            rootId,
            dto.leadId,
        );

        await ref.update({

            name:
                dto.name.trim(),

            leadId:
                dto.leadId || null,

            shiftId:
                dto.shiftId,

            updatedAt:
                new Date(),

        });

        this.logger.log(
            `Team updated | id=${id} | rootId=${rootId}`,
        );

        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // DELETE
    // ==================================================

    async remove(
        rootId: string,
        id: string,
    ) {

        this.logger.log(
            `Deleting team | id=${id} | rootId=${rootId}`,
        );

        const ref =
            this.db
                .collection('teams')
                .doc(id);

        const team =
            await ref.get();

        if (
            !team.exists ||
            team.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Team not found | id=${id} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Team not found',
            );
        }

        const executives =
            await this.db
                .collection('user')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'teamId',
                    '==',
                    id,
                )
                .limit(1)
                .get();

        if (!executives.empty) {

            this.logger.warn(
                `Team deletion blocked; executives attached | teamId=${id}`,
            );

            throw new BadRequestException(
                'Executives are attached to this team',
            );
        }

        await ref.delete();

        this.logger.log(
            `Team deleted | id=${id} | rootId=${rootId}`,
        );

        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // VALIDATION
    // ==================================================

    private validate(
        dto: TeamDto,
    ) {

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


    // ==================================================
    // VERIFY SHIFT
    // ==================================================

    private async verifyShift(
        rootId: string,
        shiftId?: string,
    ) {

        if (!shiftId) return;

        const doc =
            await this.db
                .collection('shifts')
                .doc(shiftId)
                .get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Invalid shift | shiftId=${shiftId} | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Invalid shift',
            );
        }
    }


    // ==================================================
    // VERIFY MANAGER
    // ==================================================

    private async verifyManager(
        rootId: string,
        managerId?: string,
    ) {

        if (!managerId) return;

        const doc =
            await this.db
                .collection('user')
                .doc(managerId)
                .get();

        const data =
            doc.data();

        if (
            !doc.exists ||
            data?.role !== 'child_manager' ||
            data?.reportsTo !== rootId
        ) {

            this.logger.warn(
                `Invalid manager | managerId=${managerId} | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Invalid manager',
            );
        }
    }
}