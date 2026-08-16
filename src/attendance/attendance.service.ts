import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { AttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    private get db() {
        return this.firebase.firestore;
    }


    async getData(
        rootId: string,
        dto: AttendanceDto,
    ) {

        await this.verifyExecutive(
            rootId,
            dto.executiveId,
        );


        const start = new Date(
            dto.year,
            dto.month - 1,
            1,
        );

        const end = new Date(
            dto.year,
            dto.month,
            1,
        );


        const snapshot = await this.db
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


        const records = snapshot.docs.map(
            doc => {

                const data = doc.data();

                return {
                    id: doc.id,
                    date: data.date ?? null,
                    checkInTime:
                        data.checkInTime ?? null,
                    checkOutTime:
                        data.checkOutTime ?? null,
                    workingMinutes:
                        data.workingMinutes ?? 0,
                    status:
                        data.status ?? 'absent',
                };

            },
        );


        return {
            records,
            summary: this.getSummary(records),
        };

    }


    private getSummary(records: any[]) {

        return {
            totalPresent:
                records.filter(
                    x => x.status === 'present',
                ).length,

            totalLate:
                records.filter(
                    x => x.status === 'late',
                ).length,

            totalHalfDay:
                records.filter(
                    x => x.status === 'half_day',
                ).length,

            totalWeeklyOff:
                records.filter(
                    x => x.status === 'weekly_off',
                ).length,

            totalAbsent:
                records.filter(
                    x => x.status === 'absent',
                ).length,

            totalWorkingMinutes:
                records.reduce(
                    (sum, x) =>
                        sum +
                        (x.workingMinutes || 0),
                    0,
                ),
        };

    }


    private async verifyExecutive(
        rootId: string,
        executiveId: string,
    ) {

        const doc = await this.db
            .collection('user')
            .doc(executiveId)
            .get();

        const data = doc.data();

        if (
            !doc.exists ||
            data?.rootId !== rootId ||
            data?.role !== 'field_executive'
        ) {

            throw new NotFoundException(
                'Executive not found',
            );

        }

    }

}