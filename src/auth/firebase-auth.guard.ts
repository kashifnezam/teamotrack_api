import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authorization = request.headers.authorization;

    /*
     * ==========================================================
     * AUTHORIZATION HEADER
     * ==========================================================
     */

    if (!authorization) {
      this.logger.warn(
        'Authentication failed | token missing',
      );

      throw new UnauthorizedException(
        'Authorization token missing',
      );
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      this.logger.warn(
        'Authentication failed | invalid authorization format',
      );

      throw new UnauthorizedException(
        'Invalid authorization format',
      );
    }

    try {
      /*
       * ========================================================
       * VERIFY FIREBASE JWT
       * ========================================================
       */

      const decoded =
          await this.firebase.auth.verifyIdToken(token);

      /*
       * ========================================================
       * LOAD APPLICATION USER
       * ========================================================
       */

      const userDoc = await this.firebase.firestore
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

      const userData = userDoc.data();

      /*
       * ========================================================
       * ACCOUNT STATUS
       * ========================================================
       */

      if (
        userData?.isActive != null &&
        userData.isActive === false
      ) {
        this.logger.warn(
          `Authentication failed | inactive user | uid=${decoded.uid} role=${userData?.role}`,
        );

        throw new UnauthorizedException(
          'Your account is inactive. Please contact management.',
        );
      }

      /*
       * ========================================================
       * CLIENT PLATFORM
       * ========================================================
       *
       * field_executive:
       *   - Mobile      -> ALLOWED
       *   - Web/Desktop -> BLOCKED
       *
       * Other roles:
       *   - Continue normally
       *
       * Mobile app must send:
       *
       * X-Client: mobile
       */

      const client = String(
        request.headers['x-client'] ?? '',
      ).toLowerCase();

      const role = userData?.role;

      if (
        role === 'field_executive' &&
        client !== 'mobile'
      ) {
        this.logger.warn(
          `Authentication failed | field executive attempted non-mobile login | uid=${decoded.uid}`,
        );

        throw new UnauthorizedException(
          'Please login from mobile application.',
        );
      }

      /*
       * ========================================================
       * ATTACH AUTHENTICATED USER
       * ========================================================
       *
       * RoleGuard will later read request.user.role.
       */

      request.user = {
        uid: decoded.uid,
        email: decoded.email,
        ...userData,
      };

      return true;
    } catch (error) {
      /*
       * Preserve our own UnauthorizedException.
       */

      if (error instanceof UnauthorizedException) {
        throw error;
      }

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

      throw new UnauthorizedException(
        'Invalid or expired token',
      );
    }
  }
}