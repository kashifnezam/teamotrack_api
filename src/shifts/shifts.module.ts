import { Module } from '@nestjs/common';

import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
    imports: [FirebaseModule],
    controllers: [ShiftsController],
    providers: [ShiftsService],
})
export class ShiftsModule {}