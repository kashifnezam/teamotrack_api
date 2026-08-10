import { Module } from '@nestjs/common';
import { ExecutivesController } from './executives.controller';
import { ExecutivesService } from './executives.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
    imports: [FirebaseModule],
    controllers: [ExecutivesController],
    providers: [ExecutivesService],
})
export class ExecutivesModule {}