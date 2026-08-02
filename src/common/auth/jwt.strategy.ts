import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StaffRole } from '@prisma/client';
import { AuthPrincipal } from '../decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    return {
      sub: payload.sub,
      type: payload.type,
      role: payload.role,
    };
  }
}
