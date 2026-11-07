import { describe, expect, it } from "vitest";
import { expectsPhoneFromAssistant, isPhoneDictation, prepareSpeech } from "../lib/voice-input";

describe("voice input: uninterrupted phone dictation", () => {
  it("preserves a normal request and does not mistake asking for a company number for dictation", () => {
    expect(prepareSpeech("Подскажите номер вашего автосервиса", false))
      .toMatchObject({ ready: true, collectingPhone: false });
    expect(prepareSpeech("Сколько стоит замена масла?", false))
      .toMatchObject({ ready: true, text: "Сколько стоит замена масла?" });
  });

  it("recognizes an AI request to dictate a contact number", () => {
    expect(expectsPhoneFromAssistant("Подскажите номер телефона для связи.")).toBe(true);
    expect(expectsPhoneFromAssistant("Готово, заявка номер 15.")).toBe(false);
    expect(isPhoneDictation("996 700", true)).toBe(true);
  });

  it("does not submit partial phone fragments", () => {
    expect(prepareSpeech("Мой номер +996", false).ready).toBe(false);
    expect(prepareSpeech("Мой номер +996 700 123", false).collectingPhone).toBe(true);
    expect(prepareSpeech("996", true).ready).toBe(false);
    expect(prepareSpeech("996 700 123", true).ready).toBe(false);
  });

  it("joins STT numeric fragments and sends one normalized E.164 number", () => {
    expect(prepareSpeech("Меня зовут Азамат, мой номер +996 700 123 456", false))
      .toMatchObject({ ready: true, phone: "+996700123456" });
    expect(prepareSpeech("996 700 123 456", true)).toMatchObject({
      ready: true, text: "+996700123456", phone: "+996700123456",
    });
  });

  it("converts Russian spoken phone groups, including individual digits", () => {
    const natural = "Мой номер плюс девятьсот девяносто шесть семьсот сто двадцать три четыреста пятьдесят шесть";
    expect(prepareSpeech(natural, false)).toMatchObject({ ready: true, phone: "+996700123456" });
    expect(prepareSpeech("девять девять шесть семь ноль ноль один два три четыре пять шесть", true))
      .toMatchObject({ ready: true, phone: "+996700123456" });
  });

  it("supports the Kyrgyz local nine-digit form", () => {
    expect(prepareSpeech("Мой номер 700 123 456", false)).toMatchObject({
      ready: true, phone: "+996700123456",
    });
  });
});
