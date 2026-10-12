// Single password rule for first login, reset, and change password. Mirrors the
// Supabase Auth setting (minimum_password_length = 8,
// password_requirements = "lower_upper_letters_digits_symbols").
// The symbol set Supabase Auth accepts for that requirement.
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';

export const PASSWORD_RULES = Object.freeze([
  { key: 'length', label: 'At least 8 characters', test: value => value.length >= 8 },
  { key: 'upper', label: 'One uppercase letter (A–Z)', test: value => /[A-Z]/.test(value) },
  { key: 'lower', label: 'One lowercase letter (a–z)', test: value => /[a-z]/.test(value) },
  { key: 'number', label: 'One number (0–9)', test: value => /[0-9]/.test(value) },
  { key: 'special', label: 'One special character (e.g. ! @ # $ %)', test: value => [...value].some(char => SYMBOLS.includes(char)) }
]);

export function checkPassword(value = '') {
  const results = PASSWORD_RULES.map(rule => ({ ...rule, met: rule.test(value) }));
  return { results, valid: results.every(rule => rule.met) };
}

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
