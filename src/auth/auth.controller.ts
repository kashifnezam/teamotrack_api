import {
    Body,
    Controller,
    Get,
    Post,
    UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {

    constructor(
        private readonly auth: AuthService,
    ) { }


    @Post('login')
    async login(
        @Body() dto: LoginDto,
    ) {

        const result =
            await this.auth.login(dto);


        return {

            success: true,

            token:
                result.token,

            expiresIn:
                result.expiresIn,

            user:
                result.user,

        };

    }


    @Post('logout')
    logout() {

        /*
         * JWT authentication is stateless.
         *
         * There is no server-side cookie
         * to clear here.
         *
         * The frontend should remove its
         * stored token.
         */

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