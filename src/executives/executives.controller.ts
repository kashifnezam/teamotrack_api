import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ExecutivesService } from './executives.service';
import { ExecutiveDto } from './dto/executive.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RoleGuard } from 'src/auth/role.guard';
import { RestrictRoles } from 'src/auth/roles.decorator';

@Controller('executives')
@UseGuards(FirebaseAuthGuard, RoleGuard)
export class ExecutivesController {
  constructor(private readonly service: ExecutivesService) {}
  // API
  @Get('data')
  get(@CurrentUser() user: any) {
    return this.service.getAll(user.uid);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: ExecutiveDto) {
    return this.service.create(user.uid, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ExecutiveDto) {
    return this.service.update(user.uid, id, dto);
  }

  // @Delete(':id')
  // @UseGuards(FirebaseAuthGuard)
  // remove(
  //     @CurrentUser() user: any,
  //     @Param('id') id: string,
  // ) {

  //     return this.service.remove(
  //         user.uid,
  //         id,
  //     );

  // }

  @Get(':id/permissions')
  permissions(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPermissions(user.uid, id);
  }

  @Patch(':id/permissions')
  updatePermissions(@CurrentUser() user: any, @Param('id') id: string, @Body() permissions: Record<string, boolean>) {
    return this.service.updatePermissions(user.uid, id, permissions);
  }
}
