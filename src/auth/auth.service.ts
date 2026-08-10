import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import axios from 'axios';

import { FirebaseService } from '../firebase/firebase.service';
import { LoginDto } from './dto/login.dto';


@Injectable()
export class AuthService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    async login(
        dto: LoginDto,
    ) {

        try {

            const url =
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;


            const { data } =
                await axios.post(
                    url,
                    {
                        email:
                            dto.email,

                        password:
                            dto.password,

                        returnSecureToken:
                            true,
                    },
                );


            /*
             * Verify the Firebase ID token.
             */
            const decoded =
                await this.firebase.auth
                    .verifyIdToken(
                        data.idToken,
                    );


            /*
             * Load application user.
             */
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


            /*
             * Only root managers can access
             * the dashboard.
             */
            if (
                userData?.role !==
                'root_manager'
            ) {

                throw new UnauthorizedException(
                    'You are not authorized to access this resource',
                );

            }


            /*
             * Create long-lived server session.
             *
             * 7 days.
             */
            const expiresIn =
                1000 *
                60 *
                60 *
                24 *
                7;


            const sessionCookie =
                await this.firebase.auth
                    .createSessionCookie(
                        data.idToken,
                        {
                            expiresIn,
                        },
                    );


            /*
             * IMPORTANT:
             *
             * Do NOT return data.idToken.
             *
             * The browser receives the
             * session cookie instead.
             */
            return {

                sessionCookie,

                user: userData,

            };


        } catch (e: any) {

            console.error(
                'LOGIN ERROR:',
                e.response?.data ||
                e,
            );


            if (
                e instanceof
                UnauthorizedException
            ) {

                throw e;

            }


            throw new UnauthorizedException(
                e.response?.data?.error?.message ||
                'Login failed',
            );

        }

    }

}