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

import { SalaryAssignmentService } from './salary-assignment.service';
import { SalaryAssignmentDto } from './dto/salary-assignment.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RootManagerGuard } from 'src/auth/root-manager.guard';

@Controller('salary-assignments')
@UseGuards(
    FirebaseAuthGuard,
    RootManagerGuard,
)
export class SalaryAssignmentController {

    constructor(
        private readonly service:
            SalaryAssignmentService,
    ) { }


    // ==================================================
    // SPA SHELL
    // ==================================================

    @Get()
    page(
        @Res() res: Response,
    ) {

        return res.sendFile(
            'shell.html',
            {
                root:
                    './public/dashboard',
            },
        );

    }


    // ==================================================
    // GET DATA
    // ==================================================

    @Get('data')
    get(
        @CurrentUser() user: any,
    ) {

        return this.service.getAll(
            user.uid,
        );

    }


    // ==================================================
    // GET EMPLOYEE HISTORY
    // ==================================================

    @Get('employee/:employeeId')
    getEmployee(
        @CurrentUser() user: any,
        @Param('employeeId') employeeId: string,
    ) {

        return this.service.getEmployee(
            user.uid,
            employeeId,
        );

    }


    // ==================================================
    // CREATE
    // ==================================================

    @Post()
    create(
        @CurrentUser() user: any,
        @Body() dto: SalaryAssignmentDto,
    ) {

        return this.service.create(
            user.uid,
            dto,
        );

    }


    // ==================================================
    // DEACTIVATE
    // ==================================================

    @Patch(':id/deactivate')
    deactivate(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.deactivate(
            user.uid,
            id,
        );

    }

}