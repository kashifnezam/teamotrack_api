import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import axios from 'axios';

import { FirebaseService } from '../firebase/firebase.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {

  private readonly logger =
    new Logger(AuthService.name);

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

        this.logger.warn(
          `Login rejected | user not found | uid=${decoded.uid}`,
        );

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

        this.logger.warn(
          `Login rejected | unauthorized role | uid=${decoded.uid} role=${userData?.role}`,
        );

        throw new UnauthorizedException(
          'You are not authorized to access this resource',
        );
      }

      this.logger.log(
        `Login successful | uid=${decoded.uid}`,
      );

      return {
        token:
          data.idToken,

        expiresIn:
          data.expiresIn,

        user:
          userData,
      };

    } catch (e: any) {

      /*
       * Never log password or token.
       * Log Firebase/API error only.
       */
      this.logger.error(
        `Login failed | email=${dto.email} | ${
          e.response?.data?.error?.message ||
          e.message ||
          'Unknown error'
        }`,
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