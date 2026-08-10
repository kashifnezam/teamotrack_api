import {
    Body,
    Controller,
    Get,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { CurrentUser } from './current-user.decorator';


@Controller('auth')
export class AuthController {

    constructor(
        private readonly auth: AuthService,
    ) {}


    @Post('login')
    async login(
        @Body() dto: LoginDto,

        @Res({ passthrough: true })
        res: Response,
    ) {

        const result =
            await this.auth.login(dto);


        // 7 days
        const expiresIn =
            1000 *
            60 *
            60 *
            24 *
            7;


        res.cookie(
            'session',
            result.sessionCookie,
            {
                httpOnly: true,

                secure:
                    process.env.NODE_ENV ===
                    'production',

                sameSite: 'lax',

                maxAge: expiresIn,

                path: '/',
            },
        );


        return {
            success: true,

            user: result.user,
        };
    }


    @Post('logout')
    logout(
        @Res({ passthrough: true })
        res: Response,
    ) {

        res.clearCookie(
            'session',
            {
                httpOnly: true,

                secure:
                    process.env.NODE_ENV ===
                    'production',

                sameSite: 'lax',

                path: '/',
            },
        );


        return {
            success: true,
        };
    }


    @Get('me')
    @UseGuards(FirebaseAuthGuard)
    me(
        @CurrentUser()
        user: any,
    ) {

        return user;

    }

}