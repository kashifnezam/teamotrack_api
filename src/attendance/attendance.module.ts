import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { LiveTrackingController } from '../live-tracking/live-tracking.controller';

import { AttendanceService } from './attendance.service';
import { LiveTrackingService } from '../live-tracking/live-tracking.service';

import { FirebaseModule } from '../firebase/firebase.module';
import { AttendanceScheduler } from './attendance.scheduler';

@Module({
    imports: [
        FirebaseModule,
    ],

    controllers: [
        AttendanceController,
        LiveTrackingController,
    ],

    providers: [
        AttendanceService,
        LiveTrackingService,
        AttendanceScheduler,
    ],
})
export class AttendanceModule { }