import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
// import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { WebModule } from './web/web.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExecutivesModule } from './executives/executives.module';

import { TeamsModule } from './teams/teams.module';
import { ShiftsModule } from './shifts/shifts.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
    }),

    FirebaseModule, AuthModule, WebModule, DashboardModule, ExecutivesModule, TeamsModule, ShiftsModule, TasksModule
  ],
  controllers: [AppController],
  // providers: [AppService],
})
export class AppModule {}
