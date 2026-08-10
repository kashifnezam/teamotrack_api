import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';


@Injectable()
export class FirebaseAuthGuard
    implements CanActivate {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    async canActivate(
        context: ExecutionContext,
    ): Promise<boolean> {

        const request =
            context
                .switchToHttp()
                .getRequest();


        const session =
            request.cookies?.session;


        if (!session) {

            throw new UnauthorizedException(
                'Session missing',
            );

        }


        try {

            const decoded =
                await this.firebase.auth
                    .verifySessionCookie(
                        session,
                        true,
                    );


            const userDoc =
                await this.firebase.firestore
                    .collection('user')
                    .doc(decoded.uid)
                    .get();


            if (!userDoc.exists) {

                throw new UnauthorizedException(
                    'User not found',
                );

            }


            const userData =
                userDoc.data();


            if (
                userData?.role !==
                'root_manager'
            ) {

                throw new UnauthorizedException(
                    'You are not authorized to access this resource',
                );

            }


            request.user = {

                uid: decoded.uid,

                email:
                    decoded.email,

                ...userData,

            };


            return true;


        } catch (error) {

            console.error(
                'Session verification failed:',
                error,
            );


            throw new UnauthorizedException(
                'Invalid or expired session',
            );

        }

    }

}