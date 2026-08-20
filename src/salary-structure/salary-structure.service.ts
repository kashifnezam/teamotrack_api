import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { SalaryStructureDto } from './dto/salary-structure.dto';

@Injectable()
export class SalaryStructureService {

    constructor(
        private readonly firebase:
            FirebaseService,
    ) { }


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // USER
    // ==================================================

    private async getUser(
        uid: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(uid)
                .get();


        if (!doc.exists) {

            throw new NotFoundException(
                'User not found',
            );

        }


        return {

            uid:
                doc.id,

            ...doc.data(),

        } as any;

    }


    // ==================================================
    // ROOT
    // ==================================================

    private isRoot(
        user: any,
    ) {

        return [

            'root_manager',
            'root_hr',
            'root',
            'admin',

        ].includes(
            user.role,
        );

    }


    private getRootId(
        user: any,
    ): string {

        if (
            this.isRoot(user)
        ) {

            return user.uid;

        }


        if (
            !user.rootId
        ) {

            throw new BadRequestException(
                'Invalid hierarchy',
            );

        }


        return user.rootId;

    }


    // ==================================================
    // AUTHORIZATION
    // ==================================================

    private async authorize(
        uid: string,
    ) {

        const user =
            await this.getUser(
                uid,
            );


        /*
         * Salary structures affect
         * organization-wide payroll.
         *
         * Only root_manager and
         * root_hr manage them.
         */
        if (
            ![
                'root_manager',
                'root_hr',
            ].includes(
                user.role,
            )
        ) {

            throw new BadRequestException(
                'Permission denied',
            );

        }


        return {

            user,

            rootId:
                this.getRootId(
                    user,
                ),

        };

    }


    // ==================================================
    // NORMALIZE NAME
    // ==================================================

    private normalizeName(
        name: string,
    ) {

        return name
            .trim()
            .replace(
                /\s+/g,
                ' ',
            )
            .toLowerCase();

    }


    // ==================================================
    // VALIDATE
    // ==================================================

    private validateDto(
        dto: SalaryStructureDto,
    ) {

        if (
            !dto.name?.trim()
        ) {

            throw new BadRequestException(
                'Salary structure name is required',
            );

        }


        if (
            dto.basic === undefined ||
            dto.basic === null
        ) {

            throw new BadRequestException(
                'Basic salary is required',
            );

        }


        const values = [

            dto.basic,
            dto.hra,
            dto.conveyance,
            dto.otherAllowance,
            dto.incentive,
            dto.overtime,
            dto.pf,
            dto.esi,
            dto.tax,
            dto.otherDeduction,

        ];


        if (
            values.some(
                value =>
                    value !== undefined &&
                    value !== null &&
                    value < 0,
            )
        ) {

            throw new BadRequestException(
                'Salary values cannot be negative',
            );

        }

    }


    // ==================================================
    // DUPLICATE
    // ==================================================

    private async checkDuplicate(
        rootId: string,
        name: string,
        excludeId?: string,
    ) {

        const snap =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();


        const normalizedName =
            this.normalizeName(
                name,
            );


        const exists =
            snap.docs.some(
                doc => {

                    if (
                        excludeId &&
                        doc.id ===
                        excludeId
                    ) {

                        return false;

                    }


                    return (
                        this.normalizeName(
                            doc.data()
                                .name ||
                            '',
                        ) ===
                        normalizedName
                    );

                },
            );


        if (
            exists
        ) {

            throw new BadRequestException(
                'Salary structure already exists',
            );

        }

    }


    // ==================================================
    // GET ALL
    // ==================================================

    async getAll(
        userId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        const snapshot =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();


        return snapshot.docs

            .map(doc => ({

                id:
                    doc.id,

                ...doc.data(),

            }))

            .sort(
                (
                    a: any,
                    b: any,
                ) =>
                    a.name.localeCompare(
                        b.name,
                    ),
            );

    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        userId: string,
        dto: SalaryStructureDto,
    ) {

        const {
            user,
            rootId,
        } =
            await this.authorize(
                userId,
            );


        this.validateDto(
            dto,
        );


        const name =
            dto.name.trim();


        await this.checkDuplicate(
            rootId,
            name,
        );


        const now =
            new Date();


        const data = {

            rootId,

            name,

            basic:
                dto.basic,

            hra:
                dto.hra ??
                0,

            conveyance:
                dto.conveyance ??
                0,

            otherAllowance:
                dto.otherAllowance ??
                0,

            incentive:
                dto.incentive ??
                0,

            overtime:
                dto.overtime ??
                0,

            pf:
                dto.pf ??
                0,

            esi:
                dto.esi ??
                0,

            tax:
                dto.tax ??
                0,

            otherDeduction:
                dto.otherDeduction ??
                0,

            active:
                dto.active ??
                true,

            description:
                dto.description?.trim() ||
                '',

            createdBy:
                user.uid,

            createdAt:
                now,

            updatedAt:
                now,

        };


        const ref =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .add(
                    data,
                );


        return {

            id:
                ref.id,

            ...data,

        };

    }


    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        userId: string,
        id: string,
        dto: SalaryStructureDto,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        this.validateDto(
            dto,
        );


        const doc =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Salary structure not found',
            );

        }


        const name =
            dto.name.trim();


        await this.checkDuplicate(
            rootId,
            name,
            id,
        );


        const data = {

            name,

            basic:
                dto.basic,

            hra:
                dto.hra ??
                0,

            conveyance:
                dto.conveyance ??
                0,

            otherAllowance:
                dto.otherAllowance ??
                0,

            incentive:
                dto.incentive ??
                0,

            overtime:
                dto.overtime ??
                0,

            pf:
                dto.pf ??
                0,

            esi:
                dto.esi ??
                0,

            tax:
                dto.tax ??
                0,

            otherDeduction:
                dto.otherDeduction ??
                0,

            description:
                dto.description?.trim() ||
                '',

            updatedAt:
                new Date(),

        };


        await this.db
            .collection(
                'salaryStructures',
            )
            .doc(id)
            .update(
                data,
            );


        return {

            id,

            ...doc.data(),

            ...data,

        };

    }


    // ==================================================
    // DEACTIVATE
    // ==================================================

    async deactivate(
        userId: string,
        id: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        const doc =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Salary structure not found',
            );

        }


        if (
            doc.data()?.active === false
        ) {

            throw new BadRequestException(
                'Salary structure is already inactive',
            );

        }


        await this.db
            .collection(
                'salaryStructures',
            )
            .doc(id)
            .update({

                active:
                    false,

                updatedAt:
                    new Date(),

            });


        return {

            id,

            active:
                false,

        };

    }


    // ==================================================
    // REACTIVATE
    // ==================================================

    async reactivate(
        userId: string,
        id: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        const doc =
            await this.db
                .collection(
                    'salaryStructures',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Salary structure not found',
            );

        }


        if (
            doc.data()?.active === true
        ) {

            throw new BadRequestException(
                'Salary structure is already active',
            );

        }


        await this.db
            .collection(
                'salaryStructures',
            )
            .doc(id)
            .update({

                active:
                    true,

                updatedAt:
                    new Date(),

            });


        return {

            id,

            active:
                true,

        };

    }

}