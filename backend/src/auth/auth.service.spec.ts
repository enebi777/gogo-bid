import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

describe('AuthService', () => {
  let prisma: { user: any; organization: any };
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let service: AuthService;
  let tokenCounter: number;

  beforeEach(() => {
    tokenCounter = 0;
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        create: jest.fn(),
      },
    };
    jwt = {
      // Each call returns a distinct token so we can tell access vs refresh
      // tokens (and successive rotations) apart in assertions.
      sign: jest.fn(() => `signed-token-${++tokenCounter}`),
      verify: jest.fn(),
    };
    service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
  });

  describe('register', () => {
    it('throws ConflictException if the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.register('a@b.com', 'password123', 'Acme')).rejects.toThrow(ConflictException);
    });

    it('creates an org + OWNER user and returns a fresh token pair', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1' });
      prisma.user.create.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'OWNER' });

      const result = await service.register('a@b.com', 'password123', 'Acme');

      expect(prisma.organization.create).toHaveBeenCalledWith({ data: { name: 'Acme' } });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'a@b.com', organizationId: 'org-1', role: 'OWNER' }),
      });
      expect(result).toEqual({ accessToken: 'signed-token-1', refreshToken: 'signed-token-2' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: sha256('signed-token-2') },
      });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('nobody@b.com', 'whatever')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 12);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash, organizationId: 'org-1', role: 'OWNER' });
      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    });

    it('returns a token pair for correct credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 12);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash, organizationId: 'org-1', role: 'MEMBER' });

      const result = await service.login('a@b.com', 'correct-password');

      expect(result).toEqual({ accessToken: 'signed-token-1', refreshToken: 'signed-token-2' });
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the token fails JWT verification', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.refresh('garbage')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', organizationId: 'org-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.refresh('some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects and revokes the session on reuse of an already-rotated token', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', organizationId: 'org-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
        refreshTokenHash: sha256('a-different-token'), // stored hash doesn't match what's being presented
      });

      await expect(service.refresh('stale-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshTokenHash: null } });
    });

    it('rejects when no session is active (refreshTokenHash is null)', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', organizationId: 'org-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'OWNER', refreshTokenHash: null });

      await expect(service.refresh('any-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates to a new token pair when the presented token matches the stored hash', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', organizationId: 'org-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
        refreshTokenHash: sha256('current-valid-token'),
      });

      const result = await service.refresh('current-valid-token');

      expect(result).toEqual({ accessToken: 'signed-token-1', refreshToken: 'signed-token-2' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: sha256('signed-token-2') },
      });
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      const result = await service.logout('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshTokenHash: null } });
      expect(result).toEqual({ status: 'logged_out' });
    });
  });
});
