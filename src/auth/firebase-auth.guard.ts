import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class FirebaseAuthGuard
  implements CanActivate {

  private readonly logger =
    new Logger(FirebaseAuthGuard.name);

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

    const authorization =
      request.headers.authorization;

    if (!authorization) {

      this.logger.warn(
        'Authentication failed | token missing',
      );

      throw new UnauthorizedException(
        'Authorization token missing',
      );
    }

    const [type, token] =
      authorization.split(' ');

    if (
      type !== 'Bearer' ||
      !token
    ) {

      this.logger.warn(
        'Authentication failed | invalid authorization format',
      );

      throw new UnauthorizedException(
        'Invalid authorization format',
      );
    }

    try {

      /*
       * Verify Firebase JWT.
       */
      const decoded =
        await this.firebase.auth
          .verifyIdToken(token);

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
          `Authentication failed | user not found | uid=${decoded.uid}`,
        );

        throw new UnauthorizedException(
          'User not found',
        );
      }

      const userData =
        userDoc.data();

      /*
       * Dashboard authorization.
       */
      // if (userData?.role === 'field_executive') {

      //   this.logger.warn(
      //     `Authentication failed | unauthorized role | uid=${decoded.uid} role=${userData?.role}`,
      //   );

      //   throw new UnauthorizedException(
      //     'You are not authorized to access this resource',
      //   );
      // }

      /*
       * Attach authenticated user
       * to request.
       */
      request.user = {
        uid:
          decoded.uid,

        email:
          decoded.email,

        ...userData,
      };

      return true;

    } catch (error) {

      /*
       * Do not log JWT/token.
       */
      this.logger.error(
        `JWT verification failed | ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
      );

      /*
       * Preserve our own authorization
       * errors.
       */
      if (
        error instanceof
        UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid or expired token',
      );
    }
  }
}