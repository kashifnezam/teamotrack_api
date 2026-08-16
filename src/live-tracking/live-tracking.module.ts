import { Module } from '@nestjs/common';
import { LiveTrackingController } from './live-tracking.controller';
import { LiveTrackingService } from './live-tracking.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [LiveTrackingController],
  providers: [LiveTrackingService]
})
export class LiveTrackingModule {
  
} 
