import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { FirebaseService } from '../firebase/firebase.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly firebase: FirebaseService) {}

  async login(dto: LoginDto) {
  try {
    console.log('API KEY:', process.env.FIREBASE_API_KEY);

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;

    console.log('URL:', url);

    const { data } = await axios.post(url, {
      email: dto.email,
      password: dto.password,
      returnSecureToken: true,
    });

    console.log('Firebase Login Success:', data);

    const decoded = await this.firebase.auth.verifyIdToken(data.idToken);

    const userDoc = await this.firebase.firestore
      .collection('users')
      .doc(decoded.uid)
      .get();

    return {
      token: data.idToken,
      user: userDoc.data(),
    };
  } catch (e: any) {
    console.log('API KEY:', process.env.FIREBASE_API_KEY);
    console.log('ERROR:', e.response?.data || e);

    throw new UnauthorizedException(
      e.response?.data?.error?.message || 'Login failed',
    );
  }
}
}