import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller()
export class WebController {

  @Get()
  home(@Res() res: Response) {
    return res.redirect('/login');
  }

  @Get('login')
  login(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'login.html'));
  }
  
  @Get('signup')
  signup(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'signup.html'));
  }
}