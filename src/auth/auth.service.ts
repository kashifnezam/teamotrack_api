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

  async login(dto: LoginDto) {

    try {

      const url =
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;


      const { data } =
        await axios.post(
          url,
          {
            email: dto.email,

            password: dto.password,

            returnSecureToken: true,
          },
        );


      /*
       * Firebase ID token is already a JWT.
       *
       * Verify it before allowing access.
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
       * Return Firebase ID token.
       *
       * This token is a JWT and will be
       * sent using:
       *
       * Authorization: Bearer <token>
       */
      return {

        token:
          data.idToken,

        expiresIn:
          data.expiresIn,

        user:
          userData,

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