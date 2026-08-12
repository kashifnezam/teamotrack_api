import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { TeamsService } from './teams.service';
import { TeamDto } from './dto/team.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('teams')
export class TeamsController {

    constructor(
        private readonly service: TeamsService,
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
        @Body() dto: TeamDto,
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
        @Body() dto: TeamDto,
    ) {

        return this.service.update(
            user.uid,
            id,
            dto,
        );
    }


    @Delete(':id')
    @UseGuards(FirebaseAuthGuard)
    remove(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.remove(
            user.uid,
            id,
        );
    }
}