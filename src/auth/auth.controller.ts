import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';

import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

import { FirebaseAuthGuard } from './firebase-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ==========================================================
  // LOGIN
  // ==========================================================

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto);

    return {
      success: true,
      token: result.token,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  // ==========================================================
  // SIGNUP
  // ==========================================================

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    const result = await this.auth.signup(dto);

    return {
      success: true,
      message: 'Account created successfully. Please verify your email before logging in.',
      user: result.user,
    };
  }

  // ==========================================================
  // LOGOUT
  // ==========================================================

  @Post('logout')
  logout() {
    return {
      success: true,
    };
  }

  // ==========================================================
  // CURRENT USER
  // ==========================================================

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  me(
    @CurrentUser()
    user: any
  ) {
    return user;
  }
}
