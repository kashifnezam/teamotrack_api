import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { LiveTrackingController } from '../live-tracking/live-tracking.controller';

import { AttendanceService } from './attendance.service';
import { LiveTrackingService } from '../live-tracking/live-tracking.service';

import { FirebaseModule } from '../firebase/firebase.module';
import { AttendanceScheduler } from './attendance.scheduler';
import { AttendanceSchedulerService } from './scheduler.service';

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
        AttendanceSchedulerService,
        LiveTrackingService,
        AttendanceScheduler,
    ],
})
export class AttendanceModule { }