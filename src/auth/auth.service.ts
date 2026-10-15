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

      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp` + `?key=${process.env.FIREBASE_API_KEY}`;

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
          `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode` + `?key=${process.env.FIREBASE_API_KEY}`,
          {
            requestType: 'VERIFY_EMAIL',
            idToken: data.idToken,
          }
        );
      } catch (verificationError: any) {
        this.logger.warn(`Verification email failed | uid=${uid}`);
      }

      // ======================================================
      // 3. COMMON VALUES
      // ======================================================

      const now = new Date();

      /*
       * The root manager is the root of its own organization.
       */
      const rootId = uid;

      // ======================================================
      // 4. PREPARE USER DATA
      // ======================================================

      const userData: Record<string, any> = {
        userId: uid,

        fullName: dto.fullName.trim(),

        mobile: dto.mobile.trim(),

        email: dto.email.trim(),

        accountType: 'business',

        role: 'root_manager',

        rootId,

        isPremium: 'false',

        createdAt: now,

        updatedAt: now,
      };

      // ======================================================
      // 5. CREATE DEFAULT SHIFT
      // ======================================================

      const shiftRef = this.firebase.firestore.collection('shifts').doc();

      const defaultShiftId = shiftRef.id;

      const defaultShift = {
        name: 'Default Shift',

        rootId,

        /*
         * 09:00 AM - 06:00 PM
         */
        startHour: 9,

        startMinute: 0,

        endHour: 18,

        endMinute: 0,

        /*
         * 01:00 PM - 02:00 PM
         */
        breakStartHour: 13,

        breakStartMinute: 0,

        breakEndHour: 14,

        breakEndMinute: 0,

        graceMinutes: 15,

        halfDayMinutes: 240,

        fullDayMinutes: 480,

        /*
         * Sunday
         */
        weeklyOff: [0],

        /*
         * Selfie attendance disabled
         * by default.
         */
        selfieCheckIn: false,

        selfieCheckOut: false,

        createdAt: now,

        updatedAt: now,
      };

      // ======================================================
      // 6. CREATE DEFAULT TEAM
      // ======================================================

      const teamRef = this.firebase.firestore.collection('teams').doc();

      const defaultTeamId = teamRef.id;

      const defaultTeam = {
        name: 'Default Team',

        rootId,

        /*
         * Root manager does not need
         * to be a team lead.
         */
        leadId: null,

        /*
         * Every team must have a shift.
         */
        shiftId: defaultShiftId,

        totalExecutives: 0,

        activeToday: 0,

        createdBy: uid,

        createdAt: now,

        updatedAt: now,
      };

      // ======================================================
      // 7. ATTACH DEFAULT SHIFT / TEAM TO ROOT MANAGER
      // ======================================================

      userData.shiftId = defaultShiftId;

      userData.teamId = defaultTeamId;

      // ======================================================
      // 8. SAVE EVERYTHING
      // ======================================================

      /*
       * Use a Firestore batch so the initial
       * organization structure is created together.
       */
      const batch = this.firebase.firestore.batch();

      const userRef = this.firebase.firestore.collection('user').doc(uid);

      batch.set(userRef, userData);

      batch.set(shiftRef, defaultShift);

      batch.set(teamRef, defaultTeam);

      await batch.commit();

      // ======================================================
      // 9. LOG
      // ======================================================

      this.logger.log(
        `Signup successful | uid=${uid} | email=${dto.email} | ` +
          `rootId=${rootId} | shift=${defaultShiftId} | team=${defaultTeamId}`
      );

      // ======================================================
      // 10. RETURN
      // ======================================================

      return {
        user: {
          userId: uid,

          fullName: dto.fullName.trim(),

          mobile: dto.mobile.trim(),

          email: dto.email.trim(),

          accountType,

          role: 'root_manager',

          rootId,

          shiftId: defaultShiftId,

          teamId: defaultTeamId,

          fieldValue: 'free_account',
        },
      };
    } catch (e: any) {
      // ======================================================
      // FIREBASE ERROR
      // ======================================================

      const firebaseError = e.response?.data?.error?.message;

      this.logger.error(`Signup failed | email=${dto.email} | ` + `${firebaseError || e.message || 'Unknown error'}`);

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
