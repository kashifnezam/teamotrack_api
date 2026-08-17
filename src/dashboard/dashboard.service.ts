import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { DashboardDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardService {

    private readonly logger =
        new Logger(DashboardService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    async getDashboardData(
        user: any,
    ): Promise<DashboardDto> {

        try {

            if (!user?.uid) {

                this.logger.error(
                    'Dashboard request failed | user UID missing',
                );

                throw new Error(
                    'User UID is missing',
                );
            }

            const db =
                this.firebase.firestore;

            if (!db) {

                this.logger.error(
                    'Dashboard request failed | Firestore unavailable',
                );

                throw new Error(
                    'Firestore instance is not available',
                );
            }

            const now =
                new Date();

            const today =
                new Intl.DateTimeFormat(
                    'en-CA',
                    {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                    },
                )
                    .format(now)
                    .replace(/-/g, '');

            this.logger.log(
                `Dashboard fetch | uid=${user.uid} | date=${today}`,
            );


            // ==================================================
            // EXECUTIVES
            // ==================================================

            const snapshot =
                await db
                    .collection('user')
                    .where(
                        'role',
                        '==',
                        'field_executive',
                    )
                    .where(
                        'rootId',
                        '==',
                        user.uid,
                    )
                    .get();

            this.logger.log(
                `Executives fetched | count=${snapshot.size}`,
            );


            const executives =
                snapshot.docs.map(doc => {

                    const data =
                        doc.data();

                    const loc =
                        data.currLoc;

                    return {
                        id: doc.id,

                        fullName:
                            data.fullName ??
                            'Unknown',

                        ...(loc?.lat != null &&
                        loc?.lng != null
                            ? {
                                currLoc: {
                                    lat:
                                        Number(
                                            loc.lat,
                                        ),

                                    lng:
                                        Number(
                                            loc.lng,
                                        ),
                                },
                            }
                            : {}),
                    };
                });


            if (!executives.length) {

                this.logger.log(
                    `No executives found | uid=${user.uid}`,
                );

                return {
                    total: 0,
                    present: 0,
                    leave: 0,
                    late: 0,
                    executives: [],
                };
            }


            // ==================================================
            // ATTENDANCE
            // ==================================================

            const refs =
                executives.map(
                    executive =>
                        db
                            .collection(
                                'attendance',
                            )
                            .doc(
                                executive.id,
                            )
                            .collection(
                                'records',
                            )
                            .doc(today),
                );


            const attendance =
                await db.getAll(...refs);

            this.logger.log(
                `Attendance fetched | count=${attendance.length}`,
            );


            let present = 0;
            let leave = 0;
            let late = 0;

            const lateHour = 10;


            // ==================================================
            // PROCESS
            // ==================================================

            attendance.forEach(doc => {

                if (!doc.exists) {
                    return;
                }

                const data =
                    doc.data();

                if (
                    data?.status ===
                    'leave'
                ) {

                    leave++;
                    return;
                }

                if (!data?.checkInTime) {
                    return;
                }

                present++;

                const checkIn =
                    typeof data.checkInTime
                        ?.toDate ===
                    'function'
                        ? data.checkInTime.toDate()
                        : new Date(
                            data.checkInTime,
                        );

                if (
                    isNaN(
                        checkIn.getTime(),
                    )
                ) {

                    this.logger.warn(
                        `Invalid checkInTime | executive=${doc.id}`,
                    );

                    return;
                }

                if (
                    checkIn.getHours() >=
                    lateHour
                ) {
                    late++;
                }
            });


            // ==================================================
            // RESULT
            // ==================================================

            const result = {
                total:
                    executives.length,

                present,

                leave,

                late,

                executives,
            };


            this.logger.log(
                `Dashboard ready | uid=${user.uid} | total=${result.total} present=${present} leave=${leave} late=${late}`,
            );

            return result;

        } catch (error) {

            this.logger.error(
                `Dashboard fetch failed | uid=${user?.uid ?? 'unknown'} | ${
                    error instanceof Error
                        ? error.message
                        : 'Unknown error'
                }`,
                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            throw new InternalServerErrorException(
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch dashboard data',
            );
        }
    }
}