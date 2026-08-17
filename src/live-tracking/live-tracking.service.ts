import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { LiveTrackingDto } from './dto/live-tracking.dto';

@Injectable()
export class LiveTrackingService {

    private readonly logger =
        new Logger(LiveTrackingService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    private get db() {
        return this.firebase.firestore;
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


    // ==================================================
    // LIVE
    // ==================================================

    async getLive(
        rootId: string,
    ) {

        this.logger.log(
            `Fetching live tracking | rootId=${rootId}`,
        );

        try {

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
                    )
                    .get();


            this.logger.log(
                `Live tracking fetched | rootId=${rootId} | count=${snapshot.size}`,
            );


            return {
                executives:
                    snapshot.docs.map(
                        doc => ({
                            id: doc.id,

                            fullName:
                                doc.data().fullName ??
                                '',

                            teamId:
                                doc.data().teamId ??
                                '',

                            isActive:
                                doc.data().isActive !==
                                false,
                        }),
                    ),
            };

        } catch (error) {

            this.logger.error(
                `Live tracking fetch failed | rootId=${rootId}`,
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
        rootId: string,
        dto: LiveTrackingDto,
    ) {

        this.logger.log(
            `Fetching tracking history | rootId=${rootId} | executive=${dto.executiveId} | date=${dto.date}`,
        );


        await this.verifyExecutive(
            rootId,
            dto.executiveId,
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
                            data.endTime ??
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
        rootId: string,
        executiveId: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(executiveId)
                .get();

        const data =
            doc.data();


        if (
            !doc.exists ||
            data?.rootId !== rootId ||
            data?.role !==
            'field_executive'
        ) {

            this.logger.warn(
                `Invalid executive | executive=${executiveId} | rootId=${rootId}`,
            );

            throw new NotFoundException(
                'Executive not found',
            );
        }
    }

}