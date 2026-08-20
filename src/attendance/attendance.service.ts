import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { AttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {

    private readonly logger =
        new Logger(AttendanceService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) { }


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET DATA
    // ==================================================

    async getData(
        rootId: string,
        dto: AttendanceDto,
    ) {

        await this.verifyStaff(
            rootId,
            dto.executiveId,
        );


        const start =
            new Date(
                dto.year,
                dto.month - 1,
                1,
            );


        const end =
            new Date(
                dto.year,
                dto.month,
                1,
            );


        try {

            const snapshot =
                await this.db
                    .collection('attendance')
                    .doc(dto.executiveId)
                    .collection('records')
                    .where(
                        'date',
                        '>=',
                        start,
                    )
                    .where(
                        'date',
                        '<',
                        end,
                    )
                    .get();


            const records =
                snapshot.docs.map(
                    doc => {

                        const data =
                            doc.data();


                        return {

                            id:
                                doc.id,

                            date:
                                data.date ??
                                null,

                            checkInTime:
                                data.checkInTime ??
                                null,

                            checkOutTime:
                                data.checkOutTime ??
                                null,

                            workingMinutes:
                                data.workingMinutes ??
                                0,

                            status:
                                data.status ??
                                'absent',

                        };

                    },
                );


            return {

                records,

                summary:
                    this.getSummary(
                        records,
                    ),

            };

        } catch (error) {

            this.logger.error(
                `Attendance fetch failed | staff=${dto.executiveId} | ${dto.year}-${dto.month}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );

            throw error;
        }
    }


    // ==================================================
    // SUMMARY
    // ==================================================

    private getSummary(
        records: any[],
    ) {

        return {

            totalPresent:
                records.filter(
                    x =>
                        x.status ===
                        'present',
                ).length,

            totalLate:
                records.filter(
                    x =>
                        x.status ===
                        'late',
                ).length,

            totalHalfDay:
                records.filter(
                    x =>
                        x.status ===
                        'half_day',
                ).length,

            totalWeeklyOff:
                records.filter(
                    x =>
                        x.status ===
                        'weekly_off',
                ).length,

            totalAbsent:
                records.filter(
                    x =>
                        x.status ===
                        'absent',
                ).length,

            totalWorkingMinutes:
                records.reduce(
                    (
                        sum,
                        x,
                    ) =>
                        sum +
                        (
                            x.workingMinutes ||
                            0
                        ),
                    0,
                ),

        };
    }


    // ==================================================
    // VERIFY STAFF
    // ==================================================

    private async verifyStaff(
        rootId: string,
        staffId: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(staffId)
                .get();


        const data =
            doc.data();


        /*
         * Attendance is staff based,
         * not executive based.
         *
         * Any user belonging to the
         * same organization can have
         * attendance records.
         */
        if (
            !doc.exists ||
            data?.rootId !== rootId
        ) {

            this.logger.warn(
                `Staff validation failed | staff=${staffId} | root=${rootId}`,
            );


            throw new NotFoundException(
                'Staff not found',
            );
        }

    }

}