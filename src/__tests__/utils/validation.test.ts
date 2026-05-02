import {
  isValidPin,
  pinStrength,
  isValidPhoneNumber,
  isValidEmail,
  isValidUrl,
  MIN_PIN_LENGTH,
} from '../../utils/validation';

describe('isValidPin', () => {
  it('rejects empty or short PINs', () => {
    expect(isValidPin('')).toBe(false);
    expect(isValidPin('1')).toBe(false);
    expect(isValidPin('123')).toBe(false);
  });

  it(`accepts PINs of length >= ${MIN_PIN_LENGTH}`, () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
  });

  it('rejects non-numeric PINs', () => {
    expect(isValidPin('abcd')).toBe(false);
    expect(isValidPin('12ab')).toBe(false);
    expect(isValidPin('12 34')).toBe(false);
  });
});

describe('pinStrength', () => {
  it('rates repeated digits as weak', () => {
    expect(pinStrength('1111')).toBe('weak');
    expect(pinStrength('555555')).toBe('weak');
  });

  it('rates sequential digits as weak', () => {
    expect(pinStrength('1234')).toBe('weak');
    expect(pinStrength('9876')).toBe('weak');
  });

  it('rates 4-5 unique digits as medium', () => {
    expect(pinStrength('1470')).toBe('medium');
    expect(pinStrength('25891')).toBe('medium');
  });

  it('rates 6+ unique non-sequential digits as strong', () => {
    expect(pinStrength('147036')).toBe('strong');
  });
});

describe('isValidPhoneNumber', () => {
  it('accepts valid phone formats', () => {
    expect(isValidPhoneNumber('+12125551234')).toBe(true);
    expect(isValidPhoneNumber('2125551234')).toBe(true);
    expect(isValidPhoneNumber('(212) 555-1234')).toBe(true);
    expect(isValidPhoneNumber('212.555.1234')).toBe(true);
  });

  it('rejects invalid phone numbers', () => {
    expect(isValidPhoneNumber('12345')).toBe(false); // too short
    expect(isValidPhoneNumber('abc')).toBe(false);
    expect(isValidPhoneNumber('')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('returns true for valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
  });

  it('returns true for empty string (optional field)', () => {
    expect(isValidEmail('')).toBe(true);
  });

  it('returns false for invalid emails', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@missingusername.com')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('returns true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
  });

  it('returns true for empty string (optional field)', () => {
    expect(isValidUrl('')).toBe(true);
  });

  it('returns false for invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });
});
