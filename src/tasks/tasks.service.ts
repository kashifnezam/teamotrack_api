import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { TaskDto } from './dto/task.dto';

const STATUSES = [
    'pending',
    'assigned',
    'completed',
    'cancelled',
    'failed',
];

@Injectable()
export class TasksService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }


    /* ==========================================================
       Monthly Tasks
    ========================================================== */

    async getAll(
        rootId: string,
        year: number,
        month: number,
    ) {

        if (
            !Number.isInteger(year) ||
            month < 1 ||
            month > 12
        ) {
            throw new BadRequestException(
                'Invalid month',
            );
        }

        const start =
            new Date(
                year,
                month - 1,
                1,
            );

        const end =
            new Date(
                year,
                month,
                1,
            );


        const snapshot =
            await this.db
                .collection('tasks')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'startDate',
                    '>=',
                    start,
                )
                .where(
                    'startDate',
                    '<',
                    end,
                )
                .get();


        const [
            executives,
            managers,
        ] = await Promise.all([

            this.db
                .collection('user')
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

        ]);


        return {

            tasks:
                snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...this.serialize(
                        doc.data(),
                    ),
                })),

            executives:
                executives.docs.map(doc => ({
                    id: doc.id,
                    fullName:
                        doc.data().fullName ?? '',
                    email:
                        doc.data().email ?? '',
                })),

            managers:
                managers.docs.map(doc => ({
                    id: doc.id,
                    fullName:
                        doc.data().fullName ?? '',
                })),
        };
    }


    /* ==========================================================
       Create
    ========================================================== */

    async create(
        rootId: string,
        dto: TaskDto,
    ) {

        this.validate(dto);

        const assignedTo =
            dto.assignedTo || null;


        if (assignedTo) {

            await this.verifyExecutive(
                rootId,
                assignedTo,
            );
        }


        const startDate =
            new Date(dto.startDate);

        const endDate =
            new Date(dto.endDate);


        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
        ) {
            throw new BadRequestException(
                'Invalid schedule',
            );
        }


        if (endDate <= startDate) {

            throw new BadRequestException(
                'End date must be after start date',
            );
        }


        const now =
            new Date();


        const ref =
            await this.db
                .collection('tasks')
                .add({

                    title:
                        dto.title.trim(),

                    description:
                        dto.description.trim(),

                    rootId,

                    assignedTo,

                    status:
                        assignedTo
                            ? 'assigned'
                            : 'pending',

                    priority:
                        dto.priority,

                    startDate,

                    endDate,

                    isGeofence:
                        dto.isGeofence === true,

                    startLocation:
                        dto.startLocation || null,

                    endLocation:
                        dto.endLocation || null,

                    createdAt: now,
                    updatedAt: now,
                });


        return {
            success: true,
            id: ref.id,
        };
    }


    /* ==========================================================
       Update
    ========================================================== */

    async update(
        rootId: string,
        id: string,
        dto: Partial<TaskDto>,
    ) {

        const ref =
            this.db
                .collection('tasks')
                .doc(id);

        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {
            throw new NotFoundException(
                'Task not found',
            );
        }


        const task =
            doc.data()!;

        const status =
            task.status || 'pending';


        if (
            [
                'completed',
                'cancelled',
                'failed',
            ].includes(status)
        ) {

            throw new BadRequestException(
                'Completed, cancelled or failed tasks cannot be edited',
            );
        }


        const data: any = {};


        if (dto.title !== undefined) {

            if (!dto.title.trim()) {

                throw new BadRequestException(
                    'Title is required',
                );
            }

            data.title =
                dto.title.trim();
        }


        if (dto.description !== undefined) {

            if (!dto.description.trim()) {

                throw new BadRequestException(
                    'Description is required',
                );
            }

            data.description =
                dto.description.trim();
        }


        if (dto.priority !== undefined) {

            if (
                ![
                    'Low',
                    'Medium',
                    'High',
                ].includes(dto.priority)
            ) {

                throw new BadRequestException(
                    'Invalid priority',
                );
            }

            data.priority =
                dto.priority;
        }


        if (dto.startDate !== undefined) {

            const date =
                new Date(dto.startDate);

            if (Number.isNaN(date.getTime())) {

                throw new BadRequestException(
                    'Invalid start date',
                );
            }

            data.startDate =
                date;
        }


        if (dto.endDate !== undefined) {

            const date =
                new Date(dto.endDate);

            if (Number.isNaN(date.getTime())) {

                throw new BadRequestException(
                    'Invalid end date',
                );
            }

            data.endDate =
                date;
        }


        const startDate =
            data.startDate ||
            task.startDate;

        const endDate =
            data.endDate ||
            task.endDate;


        if (endDate <= startDate) {

            throw new BadRequestException(
                'End date must be after start date',
            );
        }


        /* Executive */

        if (
            dto.assignedTo !== undefined
        ) {

            if (dto.assignedTo) {

                await this.verifyExecutive(
                    rootId,
                    dto.assignedTo,
                );
            }


            data.assignedTo =
                dto.assignedTo || null;


            if (
                status === 'pending' &&
                dto.assignedTo
            ) {
                data.status = 'assigned';
            }


            if (
                !dto.assignedTo &&
                status === 'assigned'
            ) {
                data.status = 'pending';
            }
        }


        /* Location */

        if (
            dto.isGeofence !== undefined
        ) {
            data.isGeofence =
                dto.isGeofence;
        }


        if (
            dto.startLocation !== undefined
        ) {
            data.startLocation =
                dto.startLocation;
        }


        if (
            dto.endLocation !== undefined
        ) {
            data.endLocation =
                dto.endLocation;
        }


        data.updatedAt =
            new Date();


        await ref.update(data);


        return {
            success: true,
            id,
        };
    }


    /* ==========================================================
       Delete
    ========================================================== */

    async remove(
        rootId: string,
        id: string,
    ) {

        const ref =
            this.db
                .collection('tasks')
                .doc(id);

        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Task not found',
            );
        }


        await ref.delete();


        return {
            success: true,
            id,
        };
    }


    /* ==========================================================
       Status
    ========================================================== */

    async updateStatus(
        rootId: string,
        id: string,
        status: string,
    ) {

        if (
            !STATUSES.includes(status)
        ) {

            throw new BadRequestException(
                'Invalid status',
            );
        }


        const ref =
            this.db
                .collection('tasks')
                .doc(id);

        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Task not found',
            );
        }


        await ref.update({

            status,

            updatedAt:
                new Date(),
        });


        return {
            success: true,
            id,
        };
    }


    /* ==========================================================
       Executive Validation
    ========================================================== */

    private async verifyExecutive(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(id)
                .get();


        const data =
            doc.data();


        if (
            !doc.exists ||
            data?.rootId !== rootId ||
            data?.role !== 'field_executive'
        ) {

            throw new BadRequestException(
                'Invalid executive',
            );
        }
    }


    /* ==========================================================
       Validation
    ========================================================== */

    private validate(
        dto: TaskDto,
    ) {

        if (!dto.title?.trim()) {

            throw new BadRequestException(
                'Title is required',
            );
        }


        if (!dto.description?.trim()) {

            throw new BadRequestException(
                'Description is required',
            );
        }


        if (
            ![
                'Low',
                'Medium',
                'High',
            ].includes(dto.priority)
        ) {

            throw new BadRequestException(
                'Invalid priority',
            );
        }


        if (
            !dto.startDate ||
            !dto.endDate
        ) {

            throw new BadRequestException(
                'Schedule is required',
            );
        }
    }


    /* ==========================================================
       Firestore Serializer
    ========================================================== */

    private serialize(data: any) {

        const date = (value: any) =>
            value?.toDate?.() ?? value ?? null;


        return {

            ...data,

            startDate:
                date(data.startDate),

            endDate:
                date(data.endDate),

            createdAt:
                date(data.createdAt),

            updatedAt:
                date(data.updatedAt),

            startedAt:
                date(data.startedAt),

            completedAt:
                date(data.completedAt),

        };
    }
}