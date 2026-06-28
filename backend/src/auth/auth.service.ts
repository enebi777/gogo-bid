import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string, orgName: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered.');

    const organization = await this.prisma.organization.create({ data: { name: orgName } });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, organizationId: organization.id, role: 'OWNER' },
    });
    return this.issueTokens(user.id, user.organizationId, user.role);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    return this.issueTokens(user.id, user.organizationId, user.role);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; organizationId: string; role: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Invalid or expired refresh token.');

    if (!user.refreshTokenHash || user.refreshTokenHash !== this.hash(refreshToken)) {
      // Either no active session, or this token was already rotated out —
      // i.e. it's being reused (e.g. stolen + replayed). Kill the session
      // entirely rather than silently ignoring it, so a stolen token can't
      // be retried indefinitely.
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Refresh token has been revoked or already used. Please log in again.');
    }

    return this.issueTokens(user.id, user.organizationId, user.role);
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    return { status: 'logged_out' };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string, organizationId: string, role: string) {
    const payload = { sub: userId, organizationId, role };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    });
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: this.hash(refreshToken) } });
    return { accessToken, refreshToken };
  }
}
