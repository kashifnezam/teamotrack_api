import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { ShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {

    private readonly logger =
        new Logger(ShiftsService.name);

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
            `Fetching shifts | rootId=${rootId}`,
        );

        try {

            const snap =
                await this.db
                    .collection('shifts')
                    .where(
                        'rootId',
                        '==',
                        rootId,
                    )
                    .orderBy(
                        'createdAt',
                        'desc',
                    )
                    .get();

            this.logger.log(
                `Shifts fetched | rootId=${rootId} | count=${snap.size}`,
            );

            return {
                shifts:
                    snap.docs.map(doc => ({
                        id: doc.id,
                        ...this.pick(
                            doc.data(),
                        ),
                    })),
            };

        } catch (error) {

            this.logger.error(
                `Failed to fetch shifts | rootId=${rootId}`,
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
        dto: ShiftDto,
    ) {

        this.logger.log(
            `Creating shift | rootId=${rootId} | name=${dto.name}`,
        );

        this.validate(dto);

        const ref =
            await this.db
                .collection('shifts')
                .add({

                    ...dto,

                    rootId,

                    createdAt:
                        new Date(),

                    updatedAt:
                        new Date(),

                });

        this.logger.log(
            `Shift created | id=${ref.id} | rootId=${rootId}`,
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
        dto: ShiftDto,
    ) {

        this.logger.log(
            `Updating shift | id=${id} | rootId=${rootId}`,
        );

        this.validate(dto);

        const ref =
            this.db
                .collection('shifts')
                .doc(id);

        const doc =
            await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Shift not found | id=${id} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Shift not found',
            );
        }

        await ref.update({

            ...dto,

            updatedAt:
                new Date(),

        });

        this.logger.log(
            `Shift updated | id=${id} | rootId=${rootId}`,
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
            `Deleting shift | id=${id} | rootId=${rootId}`,
        );

        const ref =
            this.db
                .collection('shifts')
                .doc(id);

        const doc =
            await ref.get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            this.logger.warn(
                `Shift not found | id=${id} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Shift not found',
            );
        }


        // Prevent deleting an assigned shift.
        const teams =
            await this.db
                .collection('teams')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'shiftId',
                    '==',
                    id,
                )
                .limit(1)
                .get();


        if (!teams.empty) {

            this.logger.warn(
                `Shift deletion blocked | id=${id} | assigned to team`,
            );

            throw new BadRequestException(
                'Shift is assigned to a team',
            );
        }


        await ref.delete();

        this.logger.log(
            `Shift deleted | id=${id} | rootId=${rootId}`,
        );

        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // VALIDATE
    // ==================================================

    private validate(
        dto: ShiftDto,
    ) {

        if (!dto.name?.trim()) {

            this.logger.warn(
                'Shift validation failed | name missing',
            );

            throw new BadRequestException(
                'Shift name is required',
            );
        }


        if (
            dto.startHour > 23 ||
            dto.endHour > 23 ||
            dto.startMinute > 59 ||
            dto.endMinute > 59
        ) {

            this.logger.warn(
                `Shift validation failed | invalid time | name=${dto.name}`,
            );

            throw new BadRequestException(
                'Invalid shift time',
            );
        }


        if (
            dto.halfDayMinutes >
            dto.fullDayMinutes
        ) {

            this.logger.warn(
                `Shift validation failed | invalid attendance duration | name=${dto.name}`,
            );

            throw new BadRequestException(
                'Invalid attendance duration',
            );
        }
    }


    // ==================================================
    // PICK
    // ==================================================

    private pick(data: any) {

        return {

            name:
                data.name ?? '',

            startHour:
                data.startHour ?? 0,

            startMinute:
                data.startMinute ?? 0,

            endHour:
                data.endHour ?? 0,

            endMinute:
                data.endMinute ?? 0,

            graceMinutes:
                data.graceMinutes ?? 0,

            halfDayMinutes:
                data.halfDayMinutes ?? 0,

            fullDayMinutes:
                data.fullDayMinutes ?? 0,

            weeklyOff:
                data.weeklyOff ?? [],

        };
    }
}