import {
    Body,
    Controller,
    Get,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { AttendanceService } from './attendance.service';
import { AttendanceDto } from './dto/attendance.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('attendance')
export class AttendanceController {

    constructor(
        private readonly service: AttendanceService,
    ) {}


    // SPA shell
    @Get()
    page(@Res() res: Response) {

        return res.sendFile(
            'shell.html',
            {
                root: './public/dashboard',
            },
        );

    }


    // Attendance data
    @Post('data')
    @UseGuards(FirebaseAuthGuard)
    getData(
        @CurrentUser() user: any,
        @Body() dto: AttendanceDto,
    ) {

        return this.service.getData(
            user.uid,
            dto,
        );

    }

}