import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { SalaryAssignmentDto } from './dto/salary-assignment.dto';

@Injectable()
export class SalaryAssignmentService {

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
    // DATE
    // ==================================================

    private validateDate(
        date: string,
    ) {

        if (
            !date ||
            !/^\d{4}-\d{2}-\d{2}$/.test(
                date,
            )
        ) {

            throw new BadRequestException(
                'Invalid effective date',
            );

        }


        const parsed =
            new Date(
                `${date}T00:00:00.000Z`,
            );


        if (
            Number.isNaN(
                parsed.getTime(),
            ) ||
            parsed
                .toISOString()
                .slice(
                    0,
                    10,
                ) !== date
        ) {

            throw new BadRequestException(
                'Invalid effective date',
            );

        }

    }


    // ==================================================
    // EMPLOYEE USER
    // ==================================================

    private async getEmployeeUser(
        rootId: string,
        employeeId: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(employeeId)
                .get();


        if (!doc.exists) {

            throw new NotFoundException(
                'Employee not found',
            );

        }


        const employee = {

            uid:
                doc.id,

            ...doc.data(),

        } as any;


        /*
         * Employee must belong to
         * the same organization.
         */
        if (
            this.getRootId(
                employee,
            ) !== rootId
        ) {

            throw new NotFoundException(
                'Employee not found',
            );

        }


        return employee;

    }


    // ==================================================
    // SALARY STRUCTURE
    // ==================================================

    private async getSalaryStructure(
        rootId: string,
        id: string,
    ) {

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
                'Salary structure is inactive',
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
                    'salaryAssignments',
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
                    b.effectiveFrom.localeCompare(
                        a.effectiveFrom,
                    ),
            );

    }


    // ==================================================
    // EMPLOYEE HISTORY
    // ==================================================

    async getEmployee(
        userId: string,
        employeeId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        await this.getEmployeeUser(
            rootId,
            employeeId,
        );


        const snapshot =
            await this.db
                .collection(
                    'salaryAssignments',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'employeeId',
                    '==',
                    employeeId,
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
                    b.effectiveFrom.localeCompare(
                        a.effectiveFrom,
                    ),
            );

    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        userId: string,
        dto: SalaryAssignmentDto,
    ) {

        const {
            user,
            rootId,
        } =
            await this.authorize(
                userId,
            );


        if (
            !dto.employeeId
        ) {

            throw new BadRequestException(
                'Employee is required',
            );

        }


        if (
            !dto.salaryStructureId
        ) {

            throw new BadRequestException(
                'Salary structure is required',
            );

        }


        this.validateDate(
            dto.effectiveFrom,
        );


        const employee =
            await this.getEmployeeUser(
                rootId,
                dto.employeeId,
            );


        /*
         * Organization root/admin
         * accounts cannot receive
         * employee salary assignments.
         */
        if (
            [
                'root',
                'admin',
            ].includes(
                employee.role,
            )
        ) {

            throw new BadRequestException(
                'Invalid employee',
            );

        }


        await this.getSalaryStructure(
            rootId,
            dto.salaryStructureId,
        );


        const snapshot =
            await this.db
                .collection(
                    'salaryAssignments',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'employeeId',
                    '==',
                    dto.employeeId,
                )
                .get();


        // ==================================================
        // SAME EFFECTIVE DATE
        // ==================================================

        const overlap =
            snapshot.docs.some(
                doc => {

                    const data =
                        doc.data();


                    return (
                        data.active !== false &&
                        data.effectiveFrom ===
                        dto.effectiveFrom
                    );

                },
            );


        if (
            overlap
        ) {

            throw new BadRequestException(
                'Salary assignment already exists for this effective date',
            );

        }


        // ==================================================
        // FUTURE ASSIGNMENT
        // ==================================================

        const futureActive =
            snapshot.docs.find(
                doc => {

                    const data =
                        doc.data();


                    return (
                        data.active !== false &&
                        data.effectiveFrom >
                        dto.effectiveFrom
                    );

                },
            );


        if (
            futureActive
        ) {

            throw new BadRequestException(
                'Effective date conflicts with an existing salary assignment',
            );

        }


        const now =
            new Date();


        const data = {

            rootId,

            employeeId:
                employee.uid,

            employeeName:
                employee.fullName ??
                '',

            salaryStructureId:
                dto.salaryStructureId,

            effectiveFrom:
                dto.effectiveFrom,

            active:
                true,

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
                    'salaryAssignments',
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
                    'salaryAssignments',
                )
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Salary assignment not found',
            );

        }


        if (
            doc.data()?.active === false
        ) {

            throw new BadRequestException(
                'Salary assignment is already inactive',
            );

        }


        await this.db
            .collection(
                'salaryAssignments',
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

}