import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { LiveTrackingDto } from './dto/live-tracking.dto';

@Injectable()
export class LiveTrackingService {
    
    private readonly logger = new Logger(LiveTrackingService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // LIVE
    // ==================================================

    async getLive(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        /*
         * HR and Field Executive cannot
         * access executive live tracking.
         */
        if (
            user.role === 'hr' ||
            user.role === 'field_executive'
        ) {

            throw new BadRequestException(
                'User cannot access live tracking',
            );

        }


        try {

            /*
             * Load only field executives
             * from this organization.
             *
             * Hierarchy filtering happens
             * below.
             */
            const snapshot =
                await this.db
                    .collection('user')
                    .where(
                        'rootId',
                        '==',
                        rootId,
                    )
                    .where(
                        'role',
                        '==',
                        'field_executive',
                    )
                    .where(
                        'isTrackingEnable',
                        '==',
                        true,
                    )
                    .select(
                        'fullName',
                        'teamId',
                        'isActive',
                        'parentId',
                        'rootId',
                    )
                    .get();


            /*
             * Root can see all executives.
             */
            if (this.isRoot(user)) {

                return {
                    executives:
                        snapshot.docs.map(
                            doc =>
                                this.pickLive(
                                    doc,
                                ),
                        ),
                };

            }


            /*
             * Get complete hierarchy for
             * this organization.
             */
            const users =
                await this.getUsers(
                    rootId,
                );


            const visibleIds =
                this.getDescendantIds(
                    userId,
                    users,
                );


            return {
                executives:
                    snapshot.docs
                        .filter(doc =>
                            visibleIds.has(
                                doc.id,
                            ),
                        )
                        .map(doc =>
                            this.pickLive(
                                doc,
                            ),
                        ),
            };


        } catch (error) {

            this.logger.error(
                `Live tracking fetch failed | user=${userId}`,
                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            throw error;
        }
    }


    // ==================================================
    // HISTORY
    // ==================================================

    async getHistory(
        userId: string,
        dto: LiveTrackingDto,
    ) {

        const user =
            await this.getUser(userId);


        const rootId =
            this.getRootId(user);


        /*
         * HR and Field Executive cannot
         * inspect executive history.
         */
        if (
            user.role === 'hr' ||
            user.role === 'field_executive'
        ) {

            throw new BadRequestException(
                'User cannot access tracking history',
            );

        }


        this.logger.log(
            `Fetching tracking history | user=${userId} | executive=${dto.executiveId} | date=${dto.date}`,
        );


        /*
         * This is the important hierarchy check.
         *
         * It verifies that the requested
         * executive belongs to this user's
         * descendant hierarchy.
         */
        await this.verifyExecutive(
            user,
            dto.executiveId,
            rootId,
        );


        const dayId =
            dto.date.replace(
                /-/g,
                '',
            );


        try {

            const snapshot =
                await this.db
                    .collection('history_tpr')
                    .doc(dto.executiveId)
                    .collection('days')
                    .doc(dayId)
                    .collection('packets')
                    .orderBy('endTime')
                    .get();


            this.logger.log(
                `Tracking history fetched | executive=${dto.executiveId} | date=${dto.date} | packets=${snapshot.size}`,
            );


            return snapshot.docs.map(
                doc => {

                    const data =
                        doc.data();


                    return {

                        locations:
                            this.decodePolyline(
                                data.encodedPolyline ??
                                '',
                            ),

                        startTime:
                            data.startTime ??
                            0,

                        endTime:
                            data.endTime ??
                            0,

                        offlinePacket:
                            data.offlinePacket ===
                            true,

                        timestamp:
                            data.timestamp ??
                            null,

                    };

                },
            );


        } catch (error) {

            this.logger.error(
                `Tracking history fetch failed | executive=${dto.executiveId} | date=${dto.date}`,
                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            throw error;
        }
    }


    // ==================================================
    // VERIFY EXECUTIVE
    // ==================================================

    private async verifyExecutive(
        user: any,
        executiveId: string,
        rootId: string,
    ) {

        const executive =
            await this.getUser(
                executiveId,
            );


        if (
            executive.role !==
            'field_executive' ||
            this.getRootId(executive) !==
            rootId
        ) {

            this.logger.warn(
                `Invalid executive | executive=${executiveId} | user=${user.uid}`,
            );

            throw new NotFoundException(
                'Executive not found',
            );
        }


        /*
         * Root can access every executive
         * in the same organization.
         */
        if (this.isRoot(user)) {
            return;
        }


        /*
         * Manager can only access
         * descendants.
         */
        await this.verifyDescendant(
            user.uid,
            executiveId,
        );

    }


    // ==================================================
    // GET USERS
    // ==================================================

    private async getUsers(
        rootId: string,
    ) {

        const snapshot =
            await this.db
                .collection('user')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .select(
                    'parentId',
                    'role',
                    'rootId',
                )
                .get();


        return snapshot.docs.map(
            doc => ({
                id: doc.id,
                ...doc.data(),
            }),
        ) as any[];

    }


    // ==================================================
    // DESCENDANT IDS
    // ==================================================

    private getDescendantIds(
        userId: string,
        users: any[],
    ) {

        const children =
            new Map<string, string[]>();


        for (const item of users) {

            if (!item.parentId) {
                continue;
            }


            if (
                !children.has(
                    item.parentId,
                )
            ) {

                children.set(
                    item.parentId,
                    [],
                );

            }


            children
                .get(item.parentId)!
                .push(item.id);

        }


        const result =
            new Set<string>();


        const walk =
            (parentId: string) => {

                for (
                    const childId
                    of children.get(
                        parentId,
                    ) || []
                ) {

                    result.add(
                        childId,
                    );

                    walk(childId);

                }

            };


        walk(userId);


        return result;

    }


    // ==================================================
    // VERIFY DESCENDANT
    // ==================================================

    private async verifyDescendant(
        parentId: string,
        targetId: string,
    ) {

        if (
            parentId === targetId
        ) {

            throw new BadRequestException(
                'Cannot access yourself',
            );

        }


        const target =
            await this.getUser(
                targetId,
            );


        let current =
            target;


        const visited =
            new Set<string>();


        while (
            current.parentId &&
            !visited.has(current.uid)
        ) {

            visited.add(
                current.uid,
            );


            if (
                current.parentId ===
                parentId
            ) {

                return;

            }


            current =
                await this.getUser(
                    current.parentId,
                );

        }


        throw new NotFoundException(
            'Executive not found',
        );

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
            uid: doc.id,
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

        if (this.isRoot(user)) {

            return (
                user.rootId ||
                user.uid
            );

        }


        if (!user.rootId) {

            throw new BadRequestException(
                'Invalid hierarchy',
            );

        }


        return user.rootId;

    }


    // ==================================================
    // LIVE PICK
    // ==================================================

    private pickLive(
        doc: FirebaseFirestore.QueryDocumentSnapshot,
    ) {

        const data =
            doc.data();


        return {

            id:
                doc.id,

            fullName:
                data.fullName ??
                '',

            teamId:
                data.teamId ??
                '',

            isActive:
                data.isActive !==
                false,

        };

    }


    // ==================================================
    // POLYLINE
    // ==================================================

    private decodePolyline(
        encoded: string,
    ): number[][] {

        if (!encoded) {
            return [];
        }


        const points: number[][] = [];

        let index = 0;
        let lat = 0;
        let lng = 0;


        while (
            index < encoded.length
        ) {

            let shift = 0;
            let result = 0;
            let byte: number;


            // Latitude
            do {

                byte =
                    encoded.charCodeAt(
                        index++,
                    ) - 63;


                result |=
                    (byte & 0x1f) << shift;


                shift += 5;

            } while (
                byte >= 0x20
            );


            lat +=
                (result & 1)
                    ? ~(result >> 1)
                    : result >> 1;


            // Longitude
            shift = 0;
            result = 0;


            do {

                byte =
                    encoded.charCodeAt(
                        index++,
                    ) - 63;


                result |=
                    (byte & 0x1f) << shift;


                shift += 5;

            } while (
                byte >= 0x20
            );


            lng +=
                (result & 1)
                    ? ~(result >> 1)
                    : result >> 1;


            points.push([
                lat / 1e5,
                lng / 1e5,
            ]);

        }

        return points;

    }

}