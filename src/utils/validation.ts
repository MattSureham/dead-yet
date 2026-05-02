/**
 * Shared validation utilities for Dead Yet.
 */

/** Minimum PIN length enforced during onboarding and settings. */
export const MIN_PIN_LENGTH = 4;

/**
 * Validate that a PIN is numeric-only and meets the minimum length.
 */
export function isValidPin(pin: string): boolean {
  if (!pin || pin.length < MIN_PIN_LENGTH) return false;
  return /^\d+$/.test(pin);
}

/**
 * Rate PIN strength: weak, medium, or strong.
 * - Weak: only repeated digits or sequential digits
 * - Medium: 4-5 unique digits
 * - Strong: 6+ unique digits, not all sequential
 */
export function pinStrength(pin: string): 'weak' | 'medium' | 'strong' {
  if (!isValidPin(pin)) return 'weak';

  const digits = pin.split('');
  const uniqueDigits = new Set(digits).size;

  // Repeated digits (all same) → weak
  if (uniqueDigits === 1) return 'weak';

  // Sequential ascending or descending
  const isSequential = digits.every((d, i) => {
    if (i === 0) return true;
    return parseInt(d) === parseInt(digits[i - 1]) + 1;
  });
  const isDescending = digits.every((d, i) => {
    if (i === 0) return true;
    return parseInt(d) === parseInt(digits[i - 1]) - 1;
  });
  if (isSequential || isDescending) return 'weak';

  if (uniqueDigits >= 6) return 'strong';
  if (uniqueDigits >= 4) return 'medium';
  return 'weak';
}

/**
 * Basic phone number validation (E.164-ish).
 * Accepts: +1234567890, 1234567890, (123) 456-7890, etc.
 */
export function isValidPhoneNumber(phone: string): boolean {
  const stripped = phone.replace(/[\s\-\(\)\.]/g, '');
  // Must be 7-15 digits, may start with optional +
  return /^\+?\d{7,15}$/.test(stripped);
}

/**
 * Basic email validation.
 */
export function isValidEmail(email: string): boolean {
  if (!email) return true; // email is optional in many forms
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Validate a URL (for webhook configuration).
 */
export function isValidUrl(url: string): boolean {
  if (!url) return true; // optional
  if (!/^https?:\/\/.+/.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
