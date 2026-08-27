import {
    Injectable,
    Logger,
} from '@nestjs/common';

import {Cron} from '@nestjs/schedule';

import { AttendanceService } from './attendance.service';

@Injectable()
export class AttendanceScheduler {

    private readonly logger =
        new Logger(
            AttendanceScheduler.name,
        );

    constructor(
        private readonly attendanceService:
            AttendanceService,
    ) { }

    /*
     * 00:30 Asia/Kolkata every day.
     *
     * This processes yesterday.
     */
    @Cron(
        '0 30 0 * * *',
        {
            name:
                'attendance-daily-processing',

            timeZone:
                'Asia/Kolkata',

            waitForCompletion:
                true,
        },
    )
    async processYesterday() {

        const date =
            this.getYesterdayIndia();

        this.logger.log(
            `Starting automatic attendance processing | date=${date}`,
        );

        try {

            const result =
                await this.attendanceService
                    .processAttendanceForDate(
                        date,
                        {
                            mode:
                                'automatic',

                            triggeredBy:
                                'scheduler',
                        },
                    );

            this.logger.log(
                `Attendance processing completed | date=${date} | processed=${result.processed} | created=${result.created} | updated=${result.updated} | skipped=${result.skipped} | errors=${result.errors.length}`,
            );

        } catch (error) {

            this.logger.error(
                `Automatic attendance processing failed | date=${date}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        }
    }

    private getYesterdayIndia(): string {

        const now =
            new Date();

        const formatter =
            new Intl.DateTimeFormat(
                'en-CA',
                {
                    timeZone:
                        'Asia/Kolkata',

                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                },
            );

        /*
         * Convert the current India date into
         * a stable YYYY-MM-DD string first.
         */
        const today =
            formatter.format(now);

        const yesterday =
            new Date(
                `${today}T00:00:00+05:30`,
            );

        yesterday.setDate(
            yesterday.getDate() - 1,
        );

        return formatter.format(
            yesterday,
        );
    }
}