import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { ExecutivesService } from './executives.service';
import { ExecutiveDto } from './dto/executive.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('executives')
export class ExecutivesController {

    constructor(
        private readonly service: ExecutivesService,
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


    // API
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    get(
        @CurrentUser() user: any,
    ) {

        return this.service.getAll(
            user.uid,
        );
    }


    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: ExecutiveDto,
    ) {

        return this.service.create(
            user.uid,
            dto,
        );
    }


    @Patch(':id')
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: ExecutiveDto,
    ) {

        return this.service.update(
            user.uid,
            id,
            dto,
        );
    }
}