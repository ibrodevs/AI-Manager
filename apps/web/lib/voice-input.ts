import { toE164 } from "./format";

/**
 * Browsers may finalize dictated phone numbers in several short Web Speech
 * results. Don't send an incomplete number to the AI midway through dictation.
 * This module is deliberately pure so it can be regression-tested without a mic.
 */
const NUMBER_WORDS: Record<string, { value: number; rank: number }> = {
  ноль: { value: 0, rank: 1 }, нуль: { value: 0, rank: 1 },
  один: { value: 1, rank: 1 }, одна: { value: 1, rank: 1 }, единица: { value: 1, rank: 1 },
  два: { value: 2, rank: 1 }, две: { value: 2, rank: 1 },
  три: { value: 3, rank: 1 }, четыре: { value: 4, rank: 1 },
  пять: { value: 5, rank: 1 }, шесть: { value: 6, rank: 1 },
  семь: { value: 7, rank: 1 }, восемь: { value: 8, rank: 1 }, девять: { value: 9, rank: 1 },
  десять: { value: 10, rank: 2 }, одиннадцать: { value: 11, rank: 2 },
  двенадцать: { value: 12, rank: 2 }, тринадцать: { value: 13, rank: 2 },
  четырнадцать: { value: 14, rank: 2 }, пятнадцать: { value: 15, rank: 2 },
  шестнадцать: { value: 16, rank: 2 }, семнадцать: { value: 17, rank: 2 },
  восемнадцать: { value: 18, rank: 2 }, девятнадцать: { value: 19, rank: 2 },
  двадцать: { value: 20, rank: 2 }, тридцать: { value: 30, rank: 2 },
  сорок: { value: 40, rank: 2 }, пятьдесят: { value: 50, rank: 2 },
  шестьдесят: { value: 60, rank: 2 }, семьдесят: { value: 70, rank: 2 },
  восемьдесят: { value: 80, rank: 2 }, девяносто: { value: 90, rank: 2 },
  сто: { value: 100, rank: 3 }, двести: { value: 200, rank: 3 },
  триста: { value: 300, rank: 3 }, четыреста: { value: 400, rank: 3 },
  пятьсот: { value: 500, rank: 3 }, шестьсот: { value: 600, rank: 3 },
  семьсот: { value: 700, rank: 3 }, восемьсот: { value: 800, rank: 3 },
  девятьсот: { value: 900, rank: 3 },
};

// Only interpret digits as *the caller's* number when they volunteer one.
 // "Подскажите номер вашего автосервиса" is an ordinary question, not a phone entry.
const PHONE_WORD_RE = /(?:мой|моя|это|оставляю|продиктую|диктую)\s+(?:контактный\s+)?(?:номер|телефон)|(?:номер|телефон)\s*(?:\+?\d|плюс\s+)/i;
const PHONE_REQUEST_RE = /телефон|номер\s+(?:для\s+связи|телефона)|(?:назовите|подскажите|оставьте|продиктуйте)\s+(?:свой\s+)?номер/i;

export function expectsPhoneFromAssistant(reply: string): boolean {
  return PHONE_REQUEST_RE.test(reply);
}

export function isPhoneDictation(text: string, expectingPhone: boolean): boolean {
  return expectingPhone || PHONE_WORD_RE.test(text);
}

export interface PreparedSpeech {
  ready: boolean;
  text: string;
  phone?: string;
  /** When false, keep all recognized fragments and continue listening. */
  collectingPhone: boolean;
}

/** Join Russian spoken number groups (e.g. "девятьсот девяносто шесть" -> 996). */
function phoneCandidate(text: string): { start: number; end: number; digits: string } | null {
  const matches = [...text.matchAll(/\+?\d+|[а-яё]+/gi)];
  const startIdx = matches.findIndex((m) => /^\+?\d+$/.test(m[0]) || NUMBER_WORDS[m[0].toLowerCase()] !== undefined);
  if (startIdx < 0) return null;
  let digits = "";
  let group = 0;
  let lastRank = 4;
  let end = matches[startIdx]!.index!;

  const flush = () => {
    if (lastRank !== 4) digits += String(group);
    group = 0; lastRank = 4;
  };
  for (let i = startIdx; i < matches.length; i++) {
    const m = matches[i]!;
    const word = m[0].toLowerCase();
    if (/^\+?\d+$/.test(word)) {
      flush();
      digits += word.replace(/\D/g, "");
    } else {
      const part = NUMBER_WORDS[word];
      if (!part) break;
      if (part.rank >= lastRank) flush();
      group += part.value;
      lastRank = part.rank;
    }
    end = m.index! + m[0].length;
  }
  flush();
  return { start: matches[startIdx]!.index!, end, digits };
}

export function prepareSpeech(text: string, expectingPhone: boolean): PreparedSpeech {
  const phrase = text.trim().replace(/\s+/g, " ");
  if (!isPhoneDictation(phrase, expectingPhone)) {
    return { ready: true, text: phrase, collectingPhone: false };
  }
  const candidate = phoneCandidate(phrase);
  const digits = candidate?.digits ?? "";
  // A partially spoken +996 country code must not be accepted as an
  // unrelated valid nine-digit local number (+996 996 ...).
  const incompleteCountryCode = digits.startsWith("996") && digits.length !== 12;
  const international = (digits.startsWith("996") && digits.length === 12) || (digits.startsWith("7") && digits.length === 11);
  const phone = digits && !incompleteCountryCode ? toE164(international ? "+" + digits : digits) : null;
  if (!phone) return { ready: false, text: phrase, collectingPhone: true };
  const normalized = phrase.slice(0, candidate!.start) + phone + phrase.slice(candidate!.end);
  return { ready: true, text: normalized, phone, collectingPhone: false };
}

export const NORMAL_SPEECH_PAUSE_MS = 1150;
export const PHONE_SPEECH_PAUSE_MS = 2800;
