import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';

import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { WebModule } from './web/web.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExecutivesModule } from './executives/executives.module';
import { TeamsModule } from './teams/teams.module';
import { ShiftsModule } from './shifts/shifts.module';
import { TasksModule } from './tasks/tasks.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LiveTrackingModule } from './live-tracking/live-tracking.module';
import { SettingsModule } from './settings/settings.module';
import { StaffModule } from './staff/staff.module';

@Module({

    imports: [

        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),


        // ==================================================
        // STATIC FILES
        // ==================================================

        ServeStaticModule.forRoot({

            rootPath: join(
                process.cwd(),
                'public',
            ),

            serveRoot: '/',

            exclude: [
                '/api/(.*)',
            ],

        }),


        // ==================================================
        // MODULES
        // ==================================================

        FirebaseModule,

        AuthModule,

        WebModule,

        DashboardModule,

        ExecutivesModule,

        TeamsModule,

        ShiftsModule,

        TasksModule,

        AttendanceModule,

        LiveTrackingModule,

        SettingsModule,

        StaffModule,

    ],

    controllers: [
        AppController,
    ],

})
export class AppModule {}