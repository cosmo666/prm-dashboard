import { CompactNumberPipe } from './compact-number.pipe';

describe('CompactNumberPipe', () => {
  let pipe: CompactNumberPipe;

  beforeEach(() => {
    pipe = new CompactNumberPipe();
  });

  it('formats integers with thousand separators', () => {
    expect(pipe.transform(1500)).toBe('1,500');
    expect(pipe.transform(15234)).toBe('15,234');
    expect(pipe.transform(2500000)).toBe('2,500,000');
  });

  it('returns "—" for null / undefined / empty string', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform('')).toBe('—');
  });

  it('returns "0" for the number 0 (not the dash)', () => {
    expect(pipe.transform(0)).toBe('0');
  });

  it('preserves up to 2 decimal places for non-integer values', () => {
    expect(pipe.transform(1712.56)).toBe('1,712.56');
  });

  it('honors maxFractionDigits override (e.g. 0 forces integer formatting)', () => {
    // 1712.56 with maxFractionDigits=0 rounds to 1,713
    expect(pipe.transform(1712.56, 0)).toBe('1,713');
  });

  it('accepts numeric strings', () => {
    expect(pipe.transform('1500')).toBe('1,500');
  });

  it('returns "—" for non-finite inputs', () => {
    expect(pipe.transform(NaN)).toBe('—');
    expect(pipe.transform(Infinity)).toBe('—');
  });
});
