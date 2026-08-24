import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  changePasswordSchema,
  clientLoginSchema,
  clientRegisterSchema,
  fcmTokenSchema,
  forgotPasswordSchema,
  refreshSchema,
  resetPasswordSchema,
  staffLoginSchema,
  verifyOtpSchema,
} from './auth.schema';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('staff/login')
  staffLogin(@Body(new ZodValidationPipe(staffLoginSchema)) body: unknown) {
    const input = body as ReturnType<typeof staffLoginSchema.parse>;
    return this.authService.staffLogin(input.email, input.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('client/register')
  clientRegister(@Body(new ZodValidationPipe(clientRegisterSchema)) body: unknown) {
    return this.authService.clientRegister(
      body as ReturnType<typeof clientRegisterSchema.parse>,
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('client/verify-otp')
  verifyOtp(@Body(new ZodValidationPipe(verifyOtpSchema)) body: unknown) {
    const input = body as ReturnType<typeof verifyOtpSchema.parse>;
    return this.authService.verifyOtp(input.phone, input.code, input.purpose);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('client/login')
  clientLogin(@Body(new ZodValidationPipe(clientLoginSchema)) body: unknown) {
    const input = body as ReturnType<typeof clientLoginSchema.parse>;
    return this.authService.clientLogin(input.bookingCode);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: unknown,
  ) {
    const input = body as ReturnType<typeof forgotPasswordSchema.parse>;
    return this.authService.forgotPassword(input.phone);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown) {
    const input = body as ReturnType<typeof resetPasswordSchema.parse>;
    return this.authService.resetPassword(
      input.phone,
      input.code,
      input.newPassword,
    );
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown,
  ) {
    const input = body as ReturnType<typeof changePasswordSchema.parse>;
    return this.authService.changePassword(
      user,
      input.currentPassword,
      input.newPassword,
    );
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    const input = body as ReturnType<typeof refreshSchema.parse>;
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  logout(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    const input = body as ReturnType<typeof refreshSchema.parse>;
    return this.authService.logout(input.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return this.authService.me(user);
  }

  @Put('me/fcm-token')
  upsertFcmToken(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(fcmTokenSchema)) body: unknown,
  ) {
    const input = body as ReturnType<typeof fcmTokenSchema.parse>;
    return this.authService.upsertFcmToken(user, input.token, input.platform);
  }
}
