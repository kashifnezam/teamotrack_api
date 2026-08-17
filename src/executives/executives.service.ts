import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ExecutiveDto } from './dto/executive.dto';

@Injectable()
export class ExecutivesService {

    private readonly logger =
        new Logger(ExecutivesService.name);

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
            `Fetching executives | rootId=${rootId}`,
        );

        try {

            const [execSnap, teamSnap] =
                await Promise.all([

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
                        .where(
                            'rootId',
                            '==',
                            rootId,
                        )
                        .select('name')
                        .get(),

                ]);


            this.logger.log(
                `Executives fetched | executives=${execSnap.size} teams=${teamSnap.size}`,
            );


            return {

                executives:
                    execSnap.docs.map(doc => {

                        const data =
                            doc.data();

                        return {
                            id: doc.id,

                            fullName:
                                data.fullName ?? '',

                            mobile:
                                data.mobile ?? '',

                            email:
                                data.email ?? '',

                            teamId:
                                data.teamId ?? '',

                            isActive:
                                data.isActive !== false,

                            isTrackingEnable:
                                data.isTrackingEnable === true,

                            gpsPriority:
                                data.gpsPriority ?? 'low',
                        };

                    }),

                teams:
                    teamSnap.docs.map(doc => ({

                        id: doc.id,

                        name:
                            doc.data().name ?? '',

                    })),

            };

        } catch (error) {

            this.logger.error(
                `Failed to fetch executives | rootId=${rootId}`,
                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            throw error;
        }
    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        rootId: string,
        dto: ExecutiveDto,
    ) {

        this.logger.log(
            `Creating executive | rootId=${rootId} | email=${dto.email} | teamId=${dto.teamId}`,
        );

        if (
            !dto.email ||
            !dto.password
        ) {

            this.logger.warn(
                `Executive creation rejected | missing credentials | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Email and password are required',
            );
        }


        await this.verifyTeam(
            rootId,
            dto.teamId,
        );


        const user =
            await this.firebase.auth.createUser({

                email:
                    dto.email,

                password:
                    dto.password,

            });


        try {

            await this.db
                .collection('user')
                .doc(user.uid)
                .set({

                    uid:
                        user.uid,

                    email:
                        dto.email,

                    fullName:
                        dto.fullName,

                    mobile:
                        dto.mobile,

                    teamId:
                        dto.teamId,

                    rootId,

                    role:
                        'field_executive',

                    isActive:
                        dto.isActive,

                    isTrackingEnable:
                        dto.isTrackingEnable,

                    gpsPriority:
                        dto.gpsPriority ?? 'low',

                    createdAt:
                        new Date(),

                });


            this.logger.log(
                `Executive created | id=${user.uid} | rootId=${rootId}`,
            );


        } catch (error) {

            this.logger.error(
                `Firestore failed after Auth user creation | id=${user.uid}`,
                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            await this.firebase.auth
                .deleteUser(user.uid);

            throw error;
        }


        return {
            success: true,
            id: user.uid,
        };
    }


    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        rootId: string,
        id: string,
        dto: ExecutiveDto,
    ) {

        this.logger.log(
            `Updating executive | id=${id} | rootId=${rootId}`,
        );

        const ref =
            this.db
                .collection('user')
                .doc(id);

        const doc =
            await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId ||
            doc.data()?.role !==
            'field_executive'
        ) {

            this.logger.warn(
                `Executive update rejected | id=${id} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Executive not found',
            );
        }


        await this.verifyTeam(
            rootId,
            dto.teamId,
        );


        await ref.update({

            fullName:
                dto.fullName,

            mobile:
                dto.mobile,

            teamId:
                dto.teamId,

            isActive:
                dto.isActive,

            isTrackingEnable:
                dto.isTrackingEnable,

            gpsPriority:
                dto.gpsPriority ?? 'low',

            updatedAt:
                new Date(),

        });


        if (dto.password) {

            await this.firebase.auth
                .updateUser(
                    id,
                    {
                        password:
                            dto.password,
                    },
                );

        }


        this.logger.log(
            `Executive updated | id=${id} | rootId=${rootId}`,
        );


        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // VERIFY TEAM
    // ==================================================

    private async verifyTeam(
        rootId: string,
        teamId: string,
    ) {

        const team =
            await this.db
                .collection('teams')
                .doc(teamId)
                .get();


        if (
            !team.exists ||
            team.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Invalid team | teamId=${teamId} | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Invalid team',
            );
        }
    }


    // ==================================================
    // PICK
    // ==================================================

    private pick(data: any) {

        return {

            fullName:
                data.fullName ?? '',

            mobile:
                data.mobile ?? '',

            email:
                data.email ?? '',

            teamId:
                data.teamId ?? '',

            isActive:
                data.isActive !== false,

            isTrackingEnable:
                data.isTrackingEnable === true,

            gpsPriority:
                data.gpsPriority ?? 'low',

        };
    }
}