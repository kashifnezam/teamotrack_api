import {
    Injectable,
    Logger,
} from '@nestjs/common';

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

import {
    Storage,
    getStorage,
} from 'firebase-admin/storage';


@Injectable()
export class FirebaseService {

    private readonly logger =
        new Logger(
            FirebaseService.name,
        );


    private readonly app:
        App;

    private readonly firestoreDb:
        Firestore;

    private readonly authDb:
        Auth;

    private readonly storageDb:
        Storage;


    constructor() {

        try {

            this.app =
                getApps().length
                    ? getApp()
                    : initializeApp({

                        storageBucket:
                            process.env
                                .FIREBASE_STORAGE_BUCKET,

                    });


            this.firestoreDb =
                getFirestore(
                    this.app,
                );


            this.authDb =
                getAuth(
                    this.app,
                );


            this.storageDb =
                getStorage(
                    this.app,
                );


            this.logger.log(
                'Firebase initialized successfully',
            );

        } catch (error) {

            this.logger.error(
                'Firebase initialization failed',

                error instanceof Error
                    ? error.stack
                    : undefined,
            );

            throw error;

        }

    }


    // ==================================================
    // FIRESTORE
    // ==================================================

    get firestore():
        Firestore {

        return this.firestoreDb;

    }


    // ==================================================
    // AUTH
    // ==================================================

    get auth():
        Auth {

        return this.authDb;

    }


    // ==================================================
    // STORAGE
    // ==================================================

    get storage():
        Storage {

        return this.storageDb;

    }

}