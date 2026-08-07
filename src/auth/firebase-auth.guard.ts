import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    constructor(private readonly firebase: FirebaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        const authHeader = request.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedException('Authorization header missing');
        }

        if (!authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Invalid authorization header');
        }

        const token = authHeader.replace('Bearer ', '');

        console.log('Header:', authHeader);
        console.log('Token Length:', token.length);
        console.log('Token Starts:', token.substring(0, 20));

        try {
            const decoded = await this.firebase.auth.verifyIdToken(token);

            const userDoc = await this.firebase.firestore
                .collection('user')
                .doc(decoded.uid)
                .get();

            if (!userDoc.exists) {
                throw new UnauthorizedException('User not found');
            }

            request.user = {
                uid: decoded.uid,
                email: decoded.email,
                ...userDoc.data(),
            };
            console.log(request.user);
            return true;
        } catch {
            throw new UnauthorizedException('Invalid token');
        }
    }
}