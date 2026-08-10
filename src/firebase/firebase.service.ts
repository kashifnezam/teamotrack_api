import { Injectable } from '@nestjs/common';

import {
    App,
    getApp,
    getApps,
    initializeApp,
} from 'firebase-admin/app';

import {
    Auth,
    getAuth,
} from 'firebase-admin/auth';

import {
    Firestore,
    getFirestore,
} from 'firebase-admin/firestore';


@Injectable()
export class FirebaseService {

    private readonly app: App;
    private readonly firestoreDb: Firestore;
    private readonly authDb: Auth;


    constructor() {

        this.app = getApps().length
            ? getApp()
            : initializeApp();

        this.firestoreDb =
            getFirestore(this.app);

        this.authDb =
            getAuth(this.app);

    }


    get firestore(): Firestore {

        return this.firestoreDb;

    }


    get auth(): Auth {

        return this.authDb;

    }

}