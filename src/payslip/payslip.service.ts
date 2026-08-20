import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PayslipService {

    private readonly templates = [

        'professional',
        'modern',
        'classic',
        'compact',

    ];


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

    private getRootId(
        user: any,
    ): string {

        if (
            [
                'root',
                'admin',
                'root_manager',
                'root_hr',
            ].includes(
                user.role,
            )
        ) {

            return (
                user.rootId ||
                user.uid
            );

        }


        if (!user.rootId) {

            throw new BadRequestException(
                'Invalid organization',
            );

        }


        return user.rootId;

    }


    // ==================================================
    // TEMPLATE
    // ==================================================

    private validateTemplate(
        template: string,
    ) {

        if (
            !this.templates.includes(
                template,
            )
        ) {

            throw new BadRequestException(
                'Invalid payslip template',
            );

        }

    }


    // ==================================================
    // ORGANIZATION
    // ==================================================

    private async getOrganization(
        rootId: string,
    ) {

        const doc =
            await this.db
                .collection('organization')
                .doc(rootId)
                .get();


        if (!doc.exists) {

            return {

                name:
                    'My Company',

                logo:
                    '',

                address:
                    '',

                email:
                    '',

                phone:
                    '',

            };

        }


        const data =
            doc.data() || {};


        return {

            name:
                data.businessName ||
                'My Company',

            logo:
                data.logo ||
                '',

            address:
                data.address ||
                '',

            email:
                data.email ||
                '',

            phone:
                data.phone ||
                '',

        };

    }


    // ==================================================
    // PAYROLL SETTINGS
    // ==================================================

    private async getPayrollSettings(
        rootId: string,
    ) {

        const doc =
            await this.db
                .collection('organization')
                .doc(rootId)
                .collection('settings')
                .doc('payroll')
                .get();


        const data =
            doc.exists
                ? doc.data() || {}
                : {};


        const template =
            data.payslipTemplate ||
            'professional';


        return {

            payslipTemplate:
                this.templates.includes(
                    template,
                )
                    ? template
                    : 'professional',

        };

    }


    // ==================================================
    // GET TEMPLATE SETTINGS
    // ==================================================

    async getTemplateSettings(
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


        const settings =
            await this.getPayrollSettings(
                rootId,
            );


        return {

            payslipTemplate:
                settings.payslipTemplate,

        };

    }


    // ==================================================
    // SET TEMPLATE
    // ==================================================

    async setTemplate(
        userId: string,
        template: string,
    ) {

        /*
         * Authorization is intentionally
         * not duplicated here.
         *
         * Manager / permission module
         * controls access.
         */

        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        this.validateTemplate(
            template,
        );


        await this.db
            .collection('organization')
            .doc(rootId)
            .collection('settings')
            .doc('payroll')
            .set(

                {

                    payslipTemplate:
                        template,

                    updatedAt:
                        new Date(),

                },

                {
                    merge:
                        true,
                },

            );


        return {

            success:
                true,

            payslipTemplate:
                template,

        };

    }


    // ==================================================
    // PAYMENT
    // ==================================================

    private async getPayment(
        rootId: string,
        paymentId: string,
    ) {

        const doc =
            await this.db
                .collection('paymentRecords')
                .doc(paymentId)
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
    // PAYROLL RECORD
    // ==================================================

    private async getPayrollRecord(
        rootId: string,
        payrollRecordId: string,
    ) {

        if (!payrollRecordId) {

            throw new NotFoundException(
                'Payroll record not found',
            );

        }


        const doc =
            await this.db
                .collection('payrollRecords')
                .doc(payrollRecordId)
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
        periodId: string,
    ) {

        if (!periodId) {

            throw new NotFoundException(
                'Payroll period not found',
            );

        }


        const doc =
            await this.db
                .collection('payrollPeriods')
                .doc(periodId)
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
                .collection('paymentRecords')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'status',
                    '==',
                    'paid',
                )
                .get();


        return {

            payslips:
                snapshot.docs
                    .map(
                        doc => ({

                            id:
                                doc.id,

                            paymentId:
                                doc.id,

                            employeeId:
                                doc.data()
                                    .employeeId,

                            employeeName:
                                doc.data()
                                    .employeeName ||
                                '',

                            payrollPeriodId:
                                doc.data()
                                    .payrollPeriodId,

                            amount:
                                doc.data()
                                    .amount ||
                                0,

                            paymentDate:
                                doc.data()
                                    .paymentDate ||
                                null,

                            paymentMethod:
                                doc.data()
                                    .paymentMethod ||
                                '',

                            transactionId:
                                doc.data()
                                    .transactionId ||
                                '',

                            status:
                                'paid',

                        }),
                    )
                    .sort(
                        (
                            a: any,
                            b: any,
                        ) =>
                            String(
                                b.paymentDate ||
                                '',
                            ).localeCompare(
                                String(
                                    a.paymentDate ||
                                    '',
                                ),
                            ),
                    ),

        };

    }


    // ==================================================
    // GET PERIOD
    // ==================================================

    async getPeriod(
        userId: string,
        periodId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        await this.getPayrollPeriod(
            rootId,
            periodId,
        );


        const snapshot =
            await this.db
                .collection('paymentRecords')
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


        return {

            payslips:
                await Promise.all(
                    snapshot.docs.map(
                        doc =>
                            this.buildPayslip(
                                rootId,
                                doc.id,
                                doc.data(),
                            ),
                    ),
                ),

        };

    }


    // ==================================================
    // GET SINGLE
    // ==================================================

    async get(
        userId: string,
        paymentId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        const payment =
            await this.getPayment(
                rootId,
                paymentId,
            );


        if (
            payment.status !==
            'paid'
        ) {

            throw new BadRequestException(
                'Payslip is available only for paid salary',
            );

        }


        return this.buildPayslip(
            rootId,
            payment.id,
            payment,
        );

    }


    // ==================================================
    // BUILD PAYSLIP
    // ==================================================

    private async buildPayslip(
        rootId: string,
        paymentId: string,
        payment: any,
    ) {

        const [
            payrollRecord,
            period,
            employee,
            organization,
            settings,
        ] = await Promise.all([

            this.getPayrollRecord(
                rootId,
                payment.payrollRecordId,
            ),

            this.getPayrollPeriod(
                rootId,
                payment.payrollPeriodId,
            ),

            this.getUser(
                payment.employeeId,
            ),

            this.getOrganization(
                rootId,
            ),

            this.getPayrollSettings(
                rootId,
            ),

        ]);


        const salary =
            payrollRecord.salary ||
            {};


        const attendance =
            payrollRecord.attendance ||
            {};


        return {

            id:
                paymentId,

            paymentId,

            payrollRecordId:
                payment.payrollRecordId,

            payrollPeriodId:
                payment.payrollPeriodId,

            template:
                settings.payslipTemplate,

            company:
                organization,

            period: {

                id:
                    period.id,

                name:
                    period.name ||
                    '',

                month:
                    period.month,

                year:
                    period.year,

                startDate:
                    period.startDate ||
                    null,

                endDate:
                    period.endDate ||
                    null,

            },

            employee: {

                id:
                    employee.uid,

                name:
                    employee.fullName ||
                    payment.employeeName ||
                    '',

                email:
                    employee.email ||
                    '',

                mobile:
                    employee.mobile ||
                    '',

                role:
                    employee.role ||
                    '',

                employeeCode:
                    employee.employeeCode ||
                    '',

            },

            attendance: {

                workingDays:
                    payrollRecord.workingDays ||
                    0,

                payableDays:
                    payrollRecord.payableDays ||
                    0,

                present:
                    attendance.present ||
                    0,

                late:
                    attendance.late ||
                    0,

                halfDay:
                    attendance.halfDay ||
                    0,

                absent:
                    attendance.absent ||
                    0,

                weeklyOff:
                    attendance.weeklyOff ||
                    0,

                holidays:
                    attendance.holidays ||
                    0,

                leave:
                    attendance.leave ||
                    0,

            },

            salary: {

                basic:
                    salary.basic ||
                    0,

                allowances:
                    salary.allowances ||
                    0,

                deductions:
                    salary.deductions ||
                    0,

                grossSalary:
                    salary.grossSalary ||
                    0,

                totalDeduction:
                    salary.totalDeduction ||
                    0,

                payableGross:
                    salary.payableGross ??
                    salary.grossSalary ??
                    0,

                payableDeduction:
                    salary.payableDeduction ??
                    salary.totalDeduction ??
                    0,

                netSalary:
                    salary.netSalary ??
                    payment.amount ??
                    0,

            },

            payment: {

                amount:
                    payment.amount ||
                    0,

                status:
                    payment.status,

                paymentMethod:
                    payment.paymentMethod ||
                    '',

                paymentDate:
                    payment.paymentDate ||
                    null,

                transactionId:
                    payment.transactionId ||
                    '',

                remarks:
                    payment.remarks ||
                    '',

            },

        };

    }


    // ==================================================
    // SPA
    // ==================================================

    page() {

        return {

            success:
                true,

        };

    }

}