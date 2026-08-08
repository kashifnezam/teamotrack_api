import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly firebase: FirebaseService,
  ) {}

  async getDashboardData(user: any) {
    const userDoc = await this.firebase.firestore
      .collection('users')
      .doc(user.uid)
      .get();

    if (!userDoc.exists) {
      return {
        uid: user.uid,
        email: user.email,
        user: null,
      };
    }

    return {
      uid: user.uid,
      email: user.email,
      user: userDoc.data(),
    };
  }
}