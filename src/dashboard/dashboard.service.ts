import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { DashboardDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    async getDashboardData(user: any): Promise<DashboardDto> {
        try {
            console.log('========== DASHBOARD START ==========');
            console.log('User:', user);

            if (!user?.uid) {
                console.error('User UID is missing:', user);
                throw new Error('User UID is missing');
            }

            const db = this.firebase.firestore;

            if (!db) {
                console.error('Firestore instance is not available');
                throw new Error('Firestore instance is not available');
            }

            // Today: YYYYMMDD
            const now = new Date();

            const today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            })
                .format(now)
                .replace(/-/g, '');

            console.log('Today:', today);

            // -----------------------------------------
            // Fetch executives
            // -----------------------------------------

            console.log('Fetching executives...');

            const snapshot = await db
                .collection('user')
                .where('role', '==', 'field_executive')
                .where('rootId', '==', user.uid)
                .get();

            console.log('Executives found:', snapshot.size);

            const executives = snapshot.docs.map(doc => {
                try {
                    const data = doc.data();

                    console.log('Executive:', {
                        id: doc.id,
                        data,
                    });

                    const loc = data.currLoc;

                    return {
                        id: doc.id,
                        fullName: data.fullName ?? 'Unknown',
                        ...(loc?.lat != null && loc?.lng != null
                            ? {
                                currLoc: {
                                    lat: Number(loc.lat),
                                    lng: Number(loc.lng),
                                },
                            }
                            : {}),
                    };
                } catch (error) {
                    console.error(
                        `Error processing executive document ${doc.id}:`,
                        error,
                    );

                    throw error;
                }
            });

            console.log('Processed executives:', executives);

            if (!executives.length) {
                console.log('No field executives found');

                return {
                    total: 0,
                    present: 0,
                    leave: 0,
                    late: 0,
                    executives: [],
                };
            }

            // -----------------------------------------
            // Attendance references
            // -----------------------------------------

            console.log('Creating attendance references...');

            const refs = executives.map(e => {
                console.log(
                    `Attendance path for ${e.id}: attendance/${e.id}/records/${today}`,
                );

                return db
                    .collection('attendance')
                    .doc(e.id)
                    .collection('records')
                    .doc(today);
            });

            // -----------------------------------------
            // Fetch attendance
            // -----------------------------------------

            console.log('Fetching attendance...');

            const attendance = await db.getAll(...refs);

            console.log(
                'Attendance documents returned:',
                attendance.length,
            );

            let present = 0;
            let leave = 0;
            let late = 0;

            // Late threshold: 10:00 AM
            const lateHour = 10;

            // -----------------------------------------
            // Process attendance
            // -----------------------------------------

            attendance.forEach(doc => {
                try {
                    console.log('Processing attendance:', {
                        id: doc.id,
                        exists: doc.exists,
                        path: doc.ref.path,
                    });

                    if (!doc.exists) {
                        console.log(
                            `Attendance does not exist for ${doc.id}`,
                        );
                        return;
                    }

                    const data = doc.data();

                    console.log(
                        `Attendance data for ${doc.id}:`,
                        data,
                    );

                    if (data?.status === 'leave') {
                        leave++;
                        return;
                    }

                    if (data?.checkInTime) {
                        present++;

                        let checkIn: Date;

                        if (
                            data.checkInTime &&
                            typeof data.checkInTime.toDate === 'function'
                        ) {
                            checkIn = data.checkInTime.toDate();
                        } else {
                            checkIn = new Date(data.checkInTime);
                        }

                        console.log(
                            `Check-in time for ${doc.id}:`,
                            checkIn,
                        );

                        if (isNaN(checkIn.getTime())) {
                            console.error(
                                `Invalid checkInTime for ${doc.id}:`,
                                data.checkInTime,
                            );
                            return;
                        }

                        if (checkIn.getHours() >= lateHour) {
                            late++;
                        }
                    }
                } catch (error) {
                    console.error(
                        `Error processing attendance document ${doc.id}:`,
                        error,
                    );

                    throw error;
                }
            });

            const result = {
                total: executives.length,
                present,
                leave,
                late,
                executives,
            };

            console.log('Dashboard result:', result);
            console.log('========== DASHBOARD END ==========');

            return result;
        } catch (error) {
            console.error('========== DASHBOARD ERROR ==========');
            console.error('Error:', error);

            if (error instanceof Error) {
                console.error('Message:', error.message);
                console.error('Stack:', error.stack);
            }

            console.error('User:', user);
            console.error('====================================');

            throw new InternalServerErrorException(
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch dashboard data',
            );
        }
    }
}