import {
    Module,
} from '@nestjs/common';

import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({

    imports: [
        FirebaseModule,
    ],

    controllers: [
        LeaveController,
    ],

    providers: [
        LeaveService,
    ],

    exports: [
        LeaveService,
    ],
})
export class LeaveModule {}