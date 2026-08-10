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

    async getAll(
        rootId: string,
        year: number,
        month: number,
        status?: string,
    ) {

        if (month < 1 || month > 12) {
            throw new BadRequestException('Invalid month');
        }

        if (status && !STATUSES.includes(status)) {
            throw new BadRequestException('Invalid status');
        }

        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        let query: FirebaseFirestore.Query =
            this.db
                .collection('tasks')
                .where('rootId', '==', rootId)
                .where('startDate', '>=', start)
                .where('startDate', '<', end);

        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query.get();

        const [executives, managers] =
            await Promise.all([
                this.db
                    .collection('user')
                    .where('rootId', '==', rootId)
                    .get(),

                this.db
                    .collection('user')
                    .where('role', '==', 'child_manager')
                    .where('reportsTo', '==', rootId)
                    .get(),
            ]);

        return {
            tasks: snapshot.docs.map(doc => ({
                id: doc.id,
                ...this.serialize(doc.data()),
            })),

            executives: executives.docs.map(doc => ({
                id: doc.id,
                fullName: doc.data().fullName ?? '',
                email: doc.data().email ?? '',
            })),

            managers: managers.docs.map(doc => ({
                id: doc.id,
                fullName: doc.data().fullName ?? '',
            })),
        };
    }

    async create(rootId: string, dto: TaskDto) {

        this.validate(dto);

        const assignedTo = dto.assignedTo || null;

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

        if (endDate <= startDate) {
            throw new BadRequestException(
                'End date must be after start date',
            );
        }

        const ref =
            await this.db.collection('tasks').add({
                title: dto.title.trim(),
                description: dto.description.trim(),
                rootId,
                assignedTo,
                status: assignedTo
                    ? 'assigned'
                    : 'pending',
                priority: dto.priority,
                startDate,
                endDate,
                isGeofence:
                    dto.isGeofence === true,
                startLocation:
                    dto.startLocation || null,
                endLocation:
                    dto.endLocation || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

        return {
            success: true,
            id: ref.id,
        };
    }

    async update(
    rootId: string,
    id: string,
    dto: Partial<TaskDto>,
) {
    const ref = this.db.collection('tasks').doc(id);
    const doc = await ref.get();

    if (
        !doc.exists ||
        doc.data()?.rootId !== rootId
    ) {
        throw new NotFoundException('Task not found');
    }

    const task = doc.data()!;
    const status = task.status || 'pending';

    // Terminal tasks cannot be edited
    if (['completed', 'cancelled', 'failed'].includes(status)) {
        throw new BadRequestException(
            'Completed, cancelled or failed tasks cannot be edited',
        );
    }

    const data: any = {};

    /*
     * Title can always be edited while task
     * is not in a terminal state, even after
     * the scheduled start time.
     */
    if (dto.title !== undefined) {
        if (!dto.title.trim()) {
            throw new BadRequestException(
                'Title is required',
            );
        }

        data.title = dto.title.trim();
    }

    // Description
    if (dto.description !== undefined) {
        if (!dto.description.trim()) {
            throw new BadRequestException(
                'Description is required',
            );
        }

        data.description = dto.description.trim();
    }

    // Priority
    if (dto.priority !== undefined) {
        if (!['Low', 'Medium', 'High'].includes(dto.priority)) {
            throw new BadRequestException(
                'Invalid priority',
            );
        }

        data.priority = dto.priority;
    }

    // Schedule
    if (dto.startDate !== undefined) {
        data.startDate = new Date(dto.startDate);
    }

    if (dto.endDate !== undefined) {
        data.endDate = new Date(dto.endDate);
    }

    const startDate =
        data.startDate || task.startDate;

    const endDate =
        data.endDate || task.endDate;

    if (endDate <= startDate) {
        throw new BadRequestException(
            'End date must be after start date',
        );
    }

    // Executive
    if (dto.assignedTo !== undefined) {

        if (dto.assignedTo) {
            await this.verifyExecutive(
                rootId,
                dto.assignedTo,
            );
        }

        data.assignedTo =
            dto.assignedTo || null;

        // Keep status consistent
        if (status === 'pending' && dto.assignedTo) {
            data.status = 'assigned';
        }

        if (
            !dto.assignedTo &&
            status === 'assigned'
        ) {
            data.status = 'pending';
        }
    }

    // Location
    if (dto.isGeofence !== undefined) {
        data.isGeofence = dto.isGeofence;
    }

    if (dto.startLocation !== undefined) {
        data.startLocation = dto.startLocation;
    }

    if (dto.endLocation !== undefined) {
        data.endLocation = dto.endLocation;
    }

    data.updatedAt = new Date();

    await ref.update(data);

    return {
        success: true,
        id,
    };
}

    async remove(
        rootId: string,
        id: string,
    ) {

        const ref =
            this.db.collection('tasks').doc(id);

        const doc = await ref.get();

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

    async updateStatus(
        rootId: string,
        id: string,
        status: string,
    ) {

        if (!STATUSES.includes(status)) {
            throw new BadRequestException(
                'Invalid status',
            );
        }

        const ref =
            this.db.collection('tasks').doc(id);

        const doc = await ref.get();

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
            updatedAt: new Date(),
        });

        return {
            success: true,
            id,
        };
    }

    private async verifyExecutive(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(id)
                .get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId ||
            doc.data()?.role !== 'field_executive'
        ) {
            throw new BadRequestException(
                'Invalid executive',
            );
        }
    }

    private validate(dto: TaskDto) {

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
            !['Low', 'Medium', 'High']
                .includes(dto.priority)
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

    private serialize(data: any) {

        return {
            ...data,

            startDate:
                data.startDate?.toDate?.() ??
                data.startDate,

            endDate:
                data.endDate?.toDate?.() ??
                data.endDate,

            createdAt:
                data.createdAt?.toDate?.() ??
                data.createdAt,

            updatedAt:
                data.updatedAt?.toDate?.() ??
                data.updatedAt,
        };
    }
}