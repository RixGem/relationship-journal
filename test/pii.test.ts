import { describe, expect, it } from 'vitest';
import { stripPII } from '../src/pii';

describe('Layer-1 PII pre-filter (stripPII)', () => {
  it('redacts emails, phones, handles, SSNs, Luhn-valid cards, and explicit names deterministically', () => {
    const input = [
      'Contact: Alice Smith, email Alice.Smith@Example.com and repeat alice.smith@example.com.',
      'Phones: 415-555-0199, +86 138 0013 8000, and 13912345678.',
      'Handle: @alice_dev and again @ALICE_DEV.',
      'SSN: 123-45-6789. Card: 4532-0151-1283-0366.',
    ].join(' ');

    const res = stripPII(input);

    expect(res.sanitized).toContain('Contact: [PERSON_1]');
    expect(res.sanitized).toContain('[EMAIL_1] and repeat [EMAIL_1]');
    expect(res.sanitized).toContain('[PHONE_1]');
    expect(res.sanitized).toContain('[PHONE_2]');
    expect(res.sanitized).toContain('[PHONE_3]');
    expect(res.sanitized).toContain('[HANDLE_1] and again [HANDLE_1]');
    expect(res.sanitized).toContain('SSN: [SSN_1]');
    expect(res.sanitized).toContain('Card: [CARD_1]');

    expect(res.sanitized).not.toContain('Alice.Smith@Example.com');
    expect(res.sanitized).not.toContain('415-555-0199');
    expect(res.sanitized).not.toContain('138 0013 8000');
    expect(res.sanitized).not.toContain('13912345678');
    expect(res.sanitized).not.toContain('123-45-6789');
    expect(res.sanitized).not.toContain('4532-0151-1283-0366');
    expect(res.sanitized).not.toContain('Alice Smith');
    expect(res.redacted_entities).toEqual(['EMAIL', 'CARD', 'SSN', 'PHONE', 'HANDLE', 'PERSON']);
  });

  it('does not falsely redact ISO dates, UUIDs, short 7-digit numbers, or non-Luhn numbers', () => {
    const input =
      'Meeting on 2026-11-21 for person 00000000-0000-4000-8000-000000000101; order 1234567; invalid card 4532-0151-1283-0367; Contact me later.';

    const res = stripPII(input);

    expect(res.sanitized).toBe(input);
    expect(res.redacted_entities).toEqual([]);
  });
});
