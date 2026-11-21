export type PiiEntityType = 'EMAIL' | 'CARD' | 'SSN' | 'PHONE' | 'HANDLE' | 'PERSON';

export interface PiiRedactionEntry {
  type: PiiEntityType;
  token: string;
}

export interface PiiRedactionResult {
  sanitized: string;
  redacted_entities: PiiEntityType[];
  redactions: PiiRedactionEntry[];
}

function passesLuhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19 || /^0+$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let doubleNext = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (doubleNext) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleNext = !doubleNext;
  }
  return sum % 10 === 0;
}

/**
 * Layer-1 deterministic regex + Luhn pre-filter run before storage or downstream LLM calls.
 *
 * Scope & limitations: this is a lightweight edge pre-filter, not a statistical NER service
 * (such as Microsoft Presidio). Unstructured free-text first names without explicit markers
 * require downstream NER.
 */
export function stripPII(raw: string): PiiRedactionResult {
  const tokenMap = new Map<string, string>();
  const typeCounters: Record<PiiEntityType, number> = {
    EMAIL: 0,
    CARD: 0,
    SSN: 0,
    PHONE: 0,
    HANDLE: 0,
    PERSON: 0,
  };
  const redactedEntities: PiiEntityType[] = [];
  const seenEntities = new Set<PiiEntityType>();
  const redactions: PiiRedactionEntry[] = [];

  const getToken = (type: PiiEntityType, normalizedValue: string): string => {
    const cacheKey = `${type}:${normalizedValue}`;
    const existing = tokenMap.get(cacheKey);
    if (existing) {
      return existing;
    }

    typeCounters[type] += 1;
    const token = `[${type}_${typeCounters[type]}]`;
    tokenMap.set(cacheKey, token);
    redactions.push({ type, token });

    if (!seenEntities.has(type)) {
      seenEntities.add(type);
      redactedEntities.push(type);
    }

    return token;
  };

  let text = raw;

  // 1. Email addresses
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) =>
    getToken('EMAIL', match.toLowerCase())
  );

  // 2. Payment cards (13-19 digits, Luhn-verified, bounded so UUIDs/IDs are not matched)
  text = text.replace(/(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (!passesLuhn(digits)) {
      return match;
    }
    return getToken('CARD', digits);
  });

  // 3. US SSN (strict 3-2-4 format)
  text = text.replace(/(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g, (match) =>
    getToken('SSN', match)
  );

  // 4a. International E.164 phone numbers (require leading '+' and 9-15 digits)
  text = text.replace(
    /(?<![\w+])\+[1-9]\d{0,2}[-.\s]?(?:\(?\d{1,4}\)?[-.\s]?){2,4}\d{2,4}(?![\w-])/g,
    (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) {
        return match;
      }
      return getToken('PHONE', digits);
    }
  );

  // 4b. US/NANP 10-digit phone numbers (avoids ISO dates YYYY-MM-DD and short numbers)
  text = text.replace(
    /(?<![\w-])(?:\(\d{3}\)\s?|\d{3}[-.\s])\d{3}[-.\s]\d{4}(?![\w-])/g,
    (match) => getToken('PHONE', match.replace(/\D/g, ''))
  );

  // 4c. Mainland China 11-digit mobile numbers (1[3-9]xxxxxxxxx)
  text = text.replace(/(?<![\w-])1[3-9]\d(?:[-.\s]?\d{4}){2}(?![\w-])/g, (match) =>
    getToken('PHONE', match.replace(/\D/g, ''))
  );

  // 5. Explicit @handles (after email replacement)
  text = text.replace(/(?<![\w.])@[a-zA-Z0-9_]{3,32}\b/g, (match) =>
    getToken('HANDLE', match.toLowerCase())
  );

  // 6. Explicit name declarations (e.g., "Name: Alice Smith", "My name is Bob")
  text = text.replace(
    /\b(?:[Nn]ame|[Ff]ull [Nn]ame|[Cc]ontact|[Mm]y name is)(\s*[:\-]?\s+)([A-Z][a-z]{1,24}(?:\s+[A-Z][a-z]{1,24}){0,2})\b/g,
    (fullMatch, sep: string, namePart: string) => {
      const prefix = fullMatch.slice(0, fullMatch.length - sep.length - namePart.length);
      const token = getToken('PERSON', namePart.toLowerCase());
      return `${prefix}${sep}${token}`;
    }
  );

  return {
    sanitized: text,
    redacted_entities: redactedEntities,
    redactions,
  };
}
