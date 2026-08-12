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


    /*
     * Read:
     *
     * Authorization: Bearer <JWT>
     */
    const authorization =
      request.headers.authorization;


    if (!authorization) {

      throw new UnauthorizedException(
        'Authorization token missing',
      );

    }


    /*
     * Expected format:
     *
     * Bearer eyJhbGciOi...
     */
    const [type, token] =
      authorization.split(' ');


    if (
      type !== 'Bearer' ||
      !token
    ) {

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
          .verifyIdToken(
            token,
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
       * Dashboard authorization.
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

      console.error(
        'JWT verification failed:',
        error,
      );


      throw new UnauthorizedException(
        'Invalid or expired token',
      );

    }

  }

}