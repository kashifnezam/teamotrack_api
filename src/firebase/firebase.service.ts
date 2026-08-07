import { Injectable } from '@nestjs/common';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { ServiceAccount } from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseService {
  private readonly app: App;

  constructor() {
    if (getApps().length) {
      this.app = getApp();
      return;
    }

    const serviceAccountPath = path.join(
      process.cwd(),
      'firebase-service-account.json',
    );

    if (fs.existsSync(serviceAccountPath)) {
      console.log('🔥 Using local Firebase Service Account');

      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, 'utf8'),
      ) as ServiceAccount;

      this.app = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      console.log('☁️ Using Cloud Run Service Account');

      this.app = initializeApp();
    }
  }

  get firestore(): Firestore {
    return getFirestore(this.app);
  }

  get auth(): Auth {
    return getAuth(this.app);
  }
}