import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

/** Talkdrop Plus billing adapter — mock checkout in development. */
export class BillingService {
  async checkout(userId: string, provider: 'stripe' | 'razorpay' | 'mock' = 'mock') {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.plan === 'plus') {
      return { url: null, status: 'already_plus' as const, message: 'Already on Talkdrop Plus' };
    }

    if (provider === 'mock' || process.env.BILLING_PROVIDER === 'mock') {
      const sub = await prisma.subscription.create({
        data: {
          userId,
          provider: 'mock',
          providerRef: `mock_${Date.now()}`,
          plan: 'plus',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      });
      await prisma.user.update({ where: { id: userId }, data: { plan: 'plus' } });
      return {
        url: null,
        status: 'activated' as const,
        subscriptionId: sub.id,
        message: 'Mock Talkdrop Plus activated (dev). Filters and HD unlocked.',
      };
    }

    // Real Stripe/Razorpay would return a hosted checkout URL
    return {
      url: `https://checkout.example.com/talkdrop-plus?user=${userId}&provider=${provider}`,
      status: 'redirect' as const,
      message: 'Complete payment with provider',
    };
  }

  async handleWebhook(payload: {
    provider: string;
    event: string;
    userId?: string;
    providerRef?: string;
  }) {
    if (payload.event === 'subscription.cancelled' && payload.userId) {
      await prisma.user.update({ where: { id: payload.userId }, data: { plan: 'free' } });
      await prisma.subscription.updateMany({
        where: { userId: payload.userId, status: 'active' },
        data: { status: 'cancelled' },
      });
    }
    if (payload.event === 'subscription.activated' && payload.userId) {
      await prisma.user.update({ where: { id: payload.userId }, data: { plan: 'plus' } });
    }
    return { received: true };
  }

  async status(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      plan: user.plan,
      plus: user.plan === 'plus',
      features: {
        hdVideo: user.plan === 'plus',
        regionFilters: user.plan === 'plus',
        languageFilters: user.plan === 'plus',
        liveTranslation: user.plan === 'plus',
        priorityMatching: user.plan === 'plus',
      },
      subscription: sub
        ? {
            id: sub.id,
            provider: sub.provider,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
    };
  }

  assertPlus(plan: string) {
    if (plan !== 'plus') {
      throw new AppError('plus_required', 'Talkdrop Plus required for this filter', 402);
    }
  }
}
