import { Module } from '@nestjs/common';

import { FirebaseModule } from '../firebase/firebase.module';

import { HierarchyController } from './hierarchy.controller';
import { HierarchyService } from './hierarchy.service';

@Module({

    imports: [
        FirebaseModule,
    ],

    controllers: [
        HierarchyController,
    ],

    providers: [
        HierarchyService,
    ],

})
export class HierarchyModule {}