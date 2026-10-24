import { describe, expect, it } from 'vitest';
import { isPhoneProduct, stripPromotionalGiftText } from './phoneProductPolicy';

describe('sold phone identity', () => {
  it.each(['华为nova15pro 手机（晒单送蓝牙耳机）', 'vivo iQOO 13 5G手机 下单送手机壳', '魅族I16ProMAX手机（限时赠充电宝）'])('keeps a phone despite gifts: %s', title => {
    expect(isPhoneProduct(title)).toBe(true);
  });
  it.each(['蓝牙耳机 下单送手机壳', '适用 iPhone 16 手机壳', '华为平板', '手机充电宝'])('does not turn an accessory into a phone: %s', title => {
    expect(isPhoneProduct(title)).toBe(false);
  });
  it('does not remove the actual phone title', () => {
    expect(stripPromotionalGiftText('华为nova15pro 手机（晒单送蓝牙耳机）')).toBe('华为nova15pro 手机');
  });
});
