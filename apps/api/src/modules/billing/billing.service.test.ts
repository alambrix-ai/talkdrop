import { describe, expect, it } from 'vitest';
import { BillingService } from './billing.service.js';

describe('BillingService.assertPlus', () => {
  it('allows plus', () => {
    expect(() => new BillingService().assertPlus('plus')).not.toThrow();
  });

  it('rejects free', () => {
    expect(() => new BillingService().assertPlus('free')).toThrow(/Plus/);
  });
});
