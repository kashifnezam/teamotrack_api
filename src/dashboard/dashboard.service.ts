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


    // ==================================================
    // DASHBOARD
    // ==================================================

    async getDashboardData(
        user: any,
    ): Promise<DashboardDto> {

        try {

            if (!user?.uid) {
                throw new Error(
                    'User UID is missing',
                );
            }


            const db =
                this.firebase.firestore;

            if (!db) {
                throw new Error(
                    'Firestore instance is not available',
                );
            }


            const rootId =
                this.getRootId(user);


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
                    .format(new Date())
                    .replace(/-/g, '');


            this.logger.log(
                `Dashboard fetch | uid=${user.uid} | rootId=${rootId} | date=${today}`,
            );


            // ==================================================
            // LOAD HIERARCHY
            // ==================================================

            const snapshot =
                await db
                    .collection('user')
                    .where(
                        'rootId',
                        '==',
                        rootId,
                    )
                    .get();


            const users =
                snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })) as any[];


            /*
             * HR and Field Executive cannot
             * manage/view executive hierarchy.
             */
            if (
                user.role === 'hr' ||
                user.role === 'field_executive'
            ) {

                return {
                    total: 0,
                    present: 0,
                    leave: 0,
                    late: 0,
                    executives: [],
                };

            }


            // ==================================================
            // FIND VISIBLE EXECUTIVES
            // ==================================================

            const executives =
                this.getExecutives(
                    user,
                    users,
                );


            this.logger.log(
                `Executives visible | uid=${user.uid} | count=${executives.length}`,
            );


            if (!executives.length) {

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
                executives.map(executive =>
                    db
                        .collection('attendance')
                        .doc(executive.id)
                        .collection('records')
                        .doc(today),
                );


            const attendance =
                await db.getAll(...refs);


            let present = 0;
            let leave = 0;
            let late = 0;


            const lateHour = 10;


            // ==================================================
            // PROCESS ATTENDANCE
            // ==================================================

            attendance.forEach(doc => {

                if (!doc.exists) return;


                const data =
                    doc.data();


                if (
                    data?.status === 'leave'
                ) {

                    leave++;

                    return;
                }


                if (!data?.checkInTime) {
                    return;
                }


                present++;


                const checkIn =
                    typeof data.checkInTime?.toDate ===
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
                `Dashboard ready | uid=${user.uid} | total=${result.total} | present=${present} | leave=${leave} | late=${late}`,
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


    // ==================================================
    // GET EXECUTIVES IN USER HIERARCHY
    // ==================================================

    private getExecutives(
        user: any,
        users: any[],
    ) {

        /*
         * Root/Admin sees all executives
         * inside the organization.
         */
        if (this.isRoot(user)) {

            return users
                .filter(
                    item =>
                        item.role ===
                        'field_executive',
                )
                .map(
                    item =>
                        this.pickExecutive(item),
                );

        }


        /*
         * Build parent -> children map.
         */
        const children =
            new Map<string, any[]>();


        for (const item of users) {

            if (!item.parentId) continue;


            if (!children.has(item.parentId)) {

                children.set(
                    item.parentId,
                    [],
                );

            }


            children
                .get(item.parentId)!
                .push(item);

        }


        /*
         * Walk only this user's
         * descendant hierarchy.
         */
        const result: any[] = [];


        const walk = (
            parentId: string,
        ) => {

            for (
                const child
                of children.get(parentId) || []
            ) {

                if (
                    child.role ===
                    'field_executive'
                ) {

                    result.push(
                        this.pickExecutive(
                            child,
                        ),
                    );

                }


                /*
                 * Continue through Manager
                 * descendants.
                 */
                if (
                    child.role ===
                    'manager'
                ) {

                    walk(child.id);

                }

            }

        };


        walk(user.uid);


        return result;

    }


    // ==================================================
    // EXECUTIVE DTO
    // ==================================================

    private pickExecutive(
        data: any,
    ) {

        const loc =
            data.currLoc;


        return {

            id:
                data.uid ||
                data.id,

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

        /*
         * Root users use their own UID
         * when they are the hierarchy root.
         */
        if (this.isRoot(user)) {

            return (
                user.rootId ||
                user.uid
            );

        }


        if (!user.rootId) {

            throw new Error(
                'Invalid hierarchy: rootId missing',
            );

        }


        return user.rootId;

    }

}