import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';

import axios from 'axios';

import { FirebaseService } from '../firebase/firebase.service';

import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly firebase: FirebaseService) {}

  // ==========================================================
  // SIGNUP
  // ==========================================================

  async signup(dto: SignupDto) {
    // ========================================================
    // VALIDATION
    // ========================================================

    if (!dto.fullName?.trim() || !dto.mobile?.trim() || !dto.email?.trim() || !dto.password) {
      throw new BadRequestException('Please fill all fields');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    // ========================================================
    // ACCOUNT TYPE
    // ========================================================

    const accountType = 'business';

    if (accountType !== 'business' && accountType !== 'personal') {
      throw new BadRequestException('Invalid account type');
    }

    try {
      // ======================================================
      // 1. CREATE FIREBASE AUTH USER
      // ======================================================

      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY}`;

      const { data } = await axios.post(url, {
        email: dto.email.trim(),

        password: dto.password,

        returnSecureToken: true,
      });

      const uid = data.localId;

      // ======================================================
      // 2. SEND EMAIL VERIFICATION
      // ======================================================

      try {
        await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.FIREBASE_API_KEY}`,
          {
            requestType: 'VERIFY_EMAIL',

            idToken: data.idToken,
          }
        );
      } catch (verificationError: any) {
        /*
         * Do not fail account creation if
         * verification email sending fails.
         *
         * This mirrors the Flutter implementation
         * where sendEmailVerification() is non-blocking.
         */

        this.logger.warn(`Verification email failed | uid=${uid}`);
      }

      // ======================================================
      // 3. PREPARE USER DATA
      // ======================================================

      const userData: Record<string, any> = {
        userId: uid,

        fullName: dto.fullName.trim(),

        mobile: dto.mobile.trim(),

        email: dto.email.trim(),

        accountType : "business",

        isPremium: 'false',

        createdAt: new Date(),
      };

      // ======================================================
      // 4. BUSINESS ACCOUNT
      // ======================================================

      if (accountType === 'business') {
        userData.role = 'root_manager';
      }

      // ======================================================
      // 5. SAVE USER DOCUMENT
      // ======================================================

      await this.firebase.firestore.collection('user').doc(uid).set(userData);

      // ======================================================
      // 6. DELETE AUTH SESSION
      // ======================================================
      //
      // Firebase REST signup returns an ID token.
      // We deliberately do NOT return it to the browser.
      //
      // Therefore the web client has no authenticated
      // session to continue with.
      //
      // User must verify email and login.
      //
      // ======================================================

      this.logger.log(`Signup successful | uid=${uid} | email=${dto.email} | accountType=${accountType}`);

      // ======================================================
      // RETURN
      // ======================================================

      return {
        user: {
          userId: uid,

          fullName: dto.fullName.trim(),

          mobile: dto.mobile.trim(),

          email: dto.email.trim(),

          accountType,

          fieldValue: 'free_account',

          ...(accountType === 'business'
            ? {
                role: 'root_manager',
              }
            : {}),
        },
      };
    } catch (e: any) {
      // ======================================================
      // FIREBASE ERROR
      // ======================================================

      const firebaseError = e.response?.data?.error?.message;

      this.logger.error(`Signup failed | email=${dto.email} | ${firebaseError || e.message || 'Unknown error'}`);

      switch (firebaseError) {
        case 'EMAIL_EXISTS':
          throw new BadRequestException('Email already registered');

        case 'INVALID_EMAIL':
          throw new BadRequestException('Invalid email address');

        case 'WEAK_PASSWORD':
          throw new BadRequestException('Password too weak');

        case 'TOO_MANY_ATTEMPTS_TRY_LATER':
          throw new BadRequestException('Too many attempts. Please try again later.');

        default:
          throw new BadRequestException(firebaseError || 'Account creation failed. Please try again.');
      }
    }
  }

  // ==========================================================
  // YOUR EXISTING LOGIN
  // ==========================================================

  async login(dto: LoginDto) {
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;

      const { data } = await axios.post(url, {
        email: dto.email,
        password: dto.password,
        returnSecureToken: true,
      });

      const decoded = await this.firebase.auth.verifyIdToken(data.idToken);

      const userDoc = await this.firebase.firestore.collection('user').doc(decoded.uid).get();

      if (!userDoc.exists) {
        this.logger.warn(`Login rejected | user not found | uid=${decoded.uid}`);

        throw new UnauthorizedException('User not found');
      }

      const userData = userDoc.data();

      if (userData?.role !== 'root_manager') {
        this.logger.warn(`Login rejected | unauthorized role | uid=${decoded.uid} role=${userData?.role}`);

        throw new UnauthorizedException('You are not authorized to access this resource');
      }

      this.logger.log(`Login successful | uid=${decoded.uid}`);

      return {
        token: data.idToken,

        expiresIn: data.expiresIn,

        user: userData,
      };
    } catch (e: any) {
      this.logger.error(
        `Login failed | email=${dto.email} | ${e.response?.data?.error?.message || e.message || 'Unknown error'}`
      );

      if (e instanceof UnauthorizedException) {
        throw e;
      }

      throw new UnauthorizedException(e.response?.data?.error?.message || 'Login failed');
    }
  }
}
