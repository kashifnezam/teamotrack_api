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

import { StaffService } from './../staff/staff.service';
import { StaffDto } from './../dto/staff.dto';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('managers')
export class ManagersController {

    constructor(
        private readonly service: StaffService,
    ) { }


    @Get()
    page(@Res() res: Response) {
        return res.sendFile(
            'shell.html',
            {
                root: './public/dashboard',
            },
        );
    }


    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    get(@CurrentUser() user: any) {

        return this.service.getAll(
            user.uid,
            'manager',
        );
    }

    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: StaffDto,
    ) {

        return this.service.create(
            user.uid,
            'manager',
            dto,
        );
    } 

    @Get('parents')
    @UseGuards(FirebaseAuthGuard)
    parents(
        @CurrentUser() user: any,
    ) {
        return this.service.getParents(
            user.uid,
            'manager',
        );
    }

    @Patch(':id')
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: StaffDto,
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


    @Get(':id/permissions')
    @UseGuards(FirebaseAuthGuard)
    permissions(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.getPermissions(
            user.uid,
            id,
        );
    }


    @Patch(':id/permissions')
    @UseGuards(FirebaseAuthGuard)
    updatePermissions(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() permissions: Record<string, boolean>,
    ) {

        return this.service.updatePermissions(
            user.uid,
            id,
            permissions,
        );
    }
}