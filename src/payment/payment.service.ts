import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { PaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {

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
            'root',
            'admin',
            'root_manager',
            'root_hr',
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

            return (
                user.rootId ||
                user.uid
            );

        }


        if (!user.rootId) {

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
    // PAYROLL RECORD
    // ==================================================

    private async getPayrollRecord(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection(
                    'payrollRecords',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Payroll record not found',
            );

        }


        return {

            id:
                doc.id,

            ...doc.data(),

        } as any;

    }


    // ==================================================
    // PAYROLL PERIOD
    // ==================================================

    private async getPayrollPeriod(
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
    // PAYMENT
    // ==================================================

    private async getPayment(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection(
                    'paymentRecords',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Payment not found',
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

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        const snapshot =
            await this.db
                .collection(
                    'paymentRecords',
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
                        a.paymentDate ||
                        a.createdAt;

                    const second =
                        b.paymentDate ||
                        b.createdAt;

                    return String(second)
                        .localeCompare(
                            String(first),
                        );

                },
            );

    }


    // ==================================================
    // GET PERIOD
    // ==================================================

    async getPeriod(
        userId: string,
        periodId: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        await this.getPayrollPeriod(
            rootId,
            periodId,
        );


        const snapshot =
            await this.db
                .collection(
                    'paymentRecords',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'payrollPeriodId',
                    '==',
                    periodId,
                )
                .get();


        return {

            payments:
                snapshot.docs.map(
                    doc => ({

                        id:
                            doc.id,

                        ...doc.data(),

                    }),
                ),

        };

    }


    // ==================================================
    // CREATE PAYMENT
    // ==================================================

    async create(
        userId: string,
        dto: PaymentDto,
    ) {

        const {
            user,
            rootId,
        } =
            await this.authorize(
                userId,
            );


        if (
            !dto.payrollRecordId
        ) {

            throw new BadRequestException(
                'Payroll record is required',
            );

        }


        const record =
            await this.getPayrollRecord(
                rootId,
                dto.payrollRecordId,
            );


        if (
            record.status !==
            'calculated'
        ) {

            throw new BadRequestException(
                'Payroll record is not ready for payment',
            );

        }


        if (
            !record.payrollPeriodId
        ) {

            throw new BadRequestException(
                'Payroll period not found',
            );

        }


        const period =
            await this.getPayrollPeriod(
                rootId,
                record.payrollPeriodId,
            );


        /*
         * Payment should only happen
         * after payroll is processed.
         */
        if (
            period.status !==
            'processed'
        ) {

            throw new BadRequestException(
                'Payroll period must be processed before payment',
            );

        }


        /*
         * Prevent duplicate payment.
         */
        const existing =
            await this.db
                .collection(
                    'paymentRecords',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'payrollRecordId',
                    '==',
                    dto.payrollRecordId,
                )
                .where(
                    'status',
                    '==',
                    'paid',
                )
                .limit(1)
                .get();


        if (
            !existing.empty
        ) {

            throw new BadRequestException(
                'Payroll has already been paid',
            );

        }


        const amount =
            Number(
                record.salary?.netSalary ||
                0,
            );


        if (
            amount <= 0
        ) {

            throw new BadRequestException(
                'Invalid payment amount',
            );

        }


        const now =
            new Date();


        const data = {

            rootId,

            payrollPeriodId:
                record.payrollPeriodId,

            payrollRecordId:
                dto.payrollRecordId,

            employeeId:
                record.employeeId,

            employeeName:
                record.employeeName ||
                '',

            amount,

            paymentMethod:
                dto.paymentMethod,

            status:
                'paid',

            paymentDate:
                now,

            transactionId:
                dto.transactionId?.trim() ||
                '',

            remarks:
                dto.remarks?.trim() ||
                '',

            paidBy:
                user.uid,

            createdAt:
                now,

            updatedAt:
                now,

        };


        const ref =
            await this.db
                .collection(
                    'paymentRecords',
                )
                .add(
                    data,
                );


        return {

            success:
                true,

            id:
                ref.id,

            ...data,

        };

    }

    // ==================================================
    // GET PAYABLE SALARIES
    // ==================================================

    async getPayable(
        userId: string,
        periodId: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        await this.getPayrollPeriod(
            rootId,
            periodId,
        );


        /*
         * Get calculated payroll.
         */
        const payrollSnap =
            await this.db
                .collection(
                    'payrollRecords',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'payrollPeriodId',
                    '==',
                    periodId,
                )
                .where(
                    'status',
                    '==',
                    'calculated',
                )
                .get();


        /*
         * Get already paid records.
         */
        const paymentSnap =
            await this.db
                .collection(
                    'paymentRecords',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'payrollPeriodId',
                    '==',
                    periodId,
                )
                .where(
                    'status',
                    '==',
                    'paid',
                )
                .get();


        const paidRecordIds =
            new Set(
                paymentSnap.docs.map(
                    doc =>
                        doc.data()
                            .payrollRecordId,
                ),
            );


        const records =
            payrollSnap.docs
                .filter(
                    doc =>
                        !paidRecordIds.has(
                            doc.id,
                        ),
                )
                .map(
                    doc => {

                        const data =
                            doc.data();


                        return {

                            id:
                                doc.id,

                            payrollRecordId:
                                doc.id,

                            employeeId:
                                data.employeeId,

                            employeeName:
                                data.employeeName ||
                                '',

                            role:
                                data.role ||
                                '',

                            payrollPeriodId:
                                data.payrollPeriodId,

                            salary:
                                data.salary || {},

                            attendance:
                                data.attendance || {},

                            leave:
                                data.leave || {},

                            workingDays:
                                data.workingDays ||
                                0,

                            payableDays:
                                data.payableDays ||
                                0,

                            status:
                                'unpaid',

                        };

                    },
                );


        return {

            records,

        };

    }

    // ==================================================
    // CANCEL
    // ==================================================

    async cancel(
        userId: string,
        id: string,
    ) {

        const {
            rootId,
        } =
            await this.authorize(
                userId,
            );


        const payment =
            await this.getPayment(
                rootId,
                id,
            );


        if (
            payment.status !==
            'paid'
        ) {

            throw new BadRequestException(
                'Payment is not active',
            );

        }


        await this.db
            .collection(
                'paymentRecords',
            )
            .doc(id)
            .update({

                status:
                    'cancelled',

                updatedAt:
                    new Date(),

            });


        return {

            success:
                true,

            id,

            status:
                'cancelled',

        };

    }

}