import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { PayrollPeriodDto } from './dto/payroll-period.dto';

@Injectable()
export class PayrollPeriodService {

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
    // DATES
    // ==================================================

    private getStartDate(
        year: number,
        month: number,
    ) {

        return `${year}-${String(month).padStart(2, '0')}-01`;

    }


    private getEndDate(
        year: number,
        month: number,
    ) {

        const date =
            new Date(
                Date.UTC(
                    year,
                    month,
                    0,
                ),
            );


        return date
            .toISOString()
            .slice(
                0,
                10,
            );

    }


    // ==================================================
    // NAME
    // ==================================================

    private getName(
        year: number,
        month: number,
    ) {

        const months = [

            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',

        ];


        return `${months[month - 1]} ${year}`;

    }


    // ==================================================
    // GET PERIOD
    // ==================================================

    private async getPeriod(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection(
                    'payrollPeriods',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Payroll period not found',
            );

        }


        return {

            id:
                doc.id,

            ...doc.data(),

        } as any;

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
                    'payrollPeriods',
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
                ) => {

                    const first =
                        `${a.year}-${String(a.month).padStart(2, '0')}`;

                    const second =
                        `${b.year}-${String(b.month).padStart(2, '0')}`;

                    return second.localeCompare(
                        first,
                    );

                },
            );

    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        userId: string,
        dto: PayrollPeriodDto,
    ) {

        const {
            user,
            rootId,
        } =
            await this.authorize(
                userId,
            );


        if (
            dto.month < 1 ||
            dto.month > 12
        ) {

            throw new BadRequestException(
                'Invalid payroll month',
            );

        }


        const startDate =
            this.getStartDate(
                dto.year,
                dto.month,
            );


        const endDate =
            this.getEndDate(
                dto.year,
                dto.month,
            );


        /*
         * One payroll period per
         * organization/month.
         */
        const existing =
            await this.db
                .collection(
                    'payrollPeriods',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'year',
                    '==',
                    dto.year,
                )
                .where(
                    'month',
                    '==',
                    dto.month,
                )
                .limit(1)
                .get();


        if (
            !existing.empty
        ) {

            throw new BadRequestException(
                'Payroll period already exists',
            );

        }


        const now =
            new Date();


        const data = {

            rootId,

            name:
                this.getName(
                    dto.year,
                    dto.month,
                ),

            year:
                dto.year,

            month:
                dto.month,

            startDate,

            endDate,

            status:
                'open',

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
                    'payrollPeriods',
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
    // STATUS
    // ==================================================

    private async changeStatus(
        userId: string,
        id: string,
        status: string,
        expected: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        const period =
            await this.getPeriod(
                rootId,
                id,
            );


        if (
            period.status !== expected
        ) {

            throw new BadRequestException(
                `Payroll period must be ${expected}`,
            );

        }


        await this.db
            .collection(
                'payrollPeriods',
            )
            .doc(id)
            .update({

                status,

                updatedAt:
                    new Date(),

            });


        return {

            id,

            status,

        };

    }


    // ==================================================
    // PROCESSING
    // ==================================================

    async processing(
        userId: string,
        id: string,
    ) {

        return this.changeStatus(
            userId,
            id,
            'processing',
            'open',
        );

    }


    // ==================================================
    // PROCESSED
    // ==================================================

    async processed(
        userId: string,
        id: string,
    ) {

        return this.changeStatus(
            userId,
            id,
            'processed',
            'processing',
        );

    }


    // ==================================================
    // CLOSED
    // ==================================================

    async closed(
        userId: string,
        id: string,
    ) {

        return this.changeStatus(
            userId,
            id,
            'closed',
            'processed',
        );

    }

    // ==================================================
    // REOPEN
    // ==================================================

    async reopen(
        userId: string,
        id: string,
    ) {

        return this.changeStatus(
            userId,
            id,
            'processed',
            'closed',
        );

    }

}