import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickDeepSeekBalance } from './keywordReview.ts';

test('pickDeepSeekBalance prefers CNY and keeps official amount strings', () => {
  const balance = pickDeepSeekBalance({
    is_available: true,
    balance_infos: [
      { currency: 'USD', total_balance: '12.50', granted_balance: '0.00', topped_up_balance: '12.50' },
      { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
    ],
  });
  assert.deepEqual(balance, {
    currency: 'CNY',
    total: '110.00',
    granted: '10.00',
    toppedUp: '100.00',
    available: true,
  });
});

test('pickDeepSeekBalance falls back to USD when CNY is missing', () => {
  const balance = pickDeepSeekBalance({
    is_available: false,
    balance_infos: [
      { currency: 'USD', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' },
    ],
  });
  assert.equal(balance.currency, 'USD');
  assert.equal(balance.total, '0.00');
  assert.equal(balance.available, false);
});
