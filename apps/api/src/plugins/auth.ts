import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../lib/prisma.js';

export interface AuthUser {
  id: string;
  ageVerified: boolean;
  trustTier: string;
  status: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    authenticateVerified: (req: FastifyRequest) => Promise<void>;
  }
}

async function resolveUser(req: FastifyRequest, config: AppConfig): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('unauthorized', 'Missing access token', 401);
  }
  const token = header.slice(7);
  const claims = await verifyAccessToken(config, token).catch(() => {
    throw new AppError('unauthorized', 'Invalid access token', 401);
  });
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) throw new AppError('unauthorized', 'User not found', 401);
  if (user.status === 'banned') throw new AppError('banned', 'Account banned', 403);
  return {
    id: user.id,
    ageVerified: user.ageVerified,
    trustTier: user.trustTier,
    status: user.status,
  };
}

export async function registerAuth(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = await resolveUser(req, config);
  });
  app.decorate('authenticateVerified', async (req: FastifyRequest) => {
    req.user = await resolveUser(req, config);
    if (!req.user.ageVerified) {
      throw new AppError('unverified', 'Age verification required', 403);
    }
    if (req.user.status === 'suspended') {
      throw new AppError('suspended', 'Account suspended', 403);
    }
  });
}
