import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import express from 'express';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { HolidayDto } from './dto/holiday.dto';
import { HolidayService } from './holiday.service';

@Controller('holidays')
export class HolidayController {
    constructor(private readonly service: HolidayService) { }

    // SPA shell
    @Get()
    shell(@Res() res: express.Response) {
        return res.sendFile('shell.html', {
            root: './public/dashboard',
        });
    }

    // Holiday data
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    get(
        @CurrentUser() user: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return startDate && endDate
            ? this.service.getRange(user.uid, startDate, endDate)
            : this.service.getAll(user.uid);
    }

    @Get('range')
    @UseGuards(FirebaseAuthGuard)
    getRange(
        @CurrentUser() user: any,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.service.getRange(user.uid, startDate, endDate);
    }

    @Get('manage')
    @UseGuards(FirebaseAuthGuard)
    getManageable(@CurrentUser() user: any) {
        return this.service.getManageable(user.uid);
    }

    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: HolidayDto,
    ) {
        return this.service.create(user.uid, dto);
    }

    @Patch(':id')
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: HolidayDto,
    ) {
        return this.service.update(user.uid, id, dto);
    }

    @Patch(':id/deactivate')
    @UseGuards(FirebaseAuthGuard)
    deactivate(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        return this.service.deactivate(user.uid, id);
    }

    @Patch(':id/reactivate')
    @UseGuards(FirebaseAuthGuard)
    reactivate(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        return this.service.reactivate(user.uid, id);
    }
}