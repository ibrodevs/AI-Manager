import type { DomainEvent } from "./types";

// Pure display helpers; sending notifications belongs to the backend.
export function renderEvent(e: DomainEvent): { text: string; buttons: { text: string; data?: string; url?: string }[] } {
  switch (e.type) {
    case "lead.created":
      return {
        text: `${e.urgent ? "🔴 Срочная заявка" : "🆕 Новая заявка"} №${e.number}\n${e.title}${e.contactName ? `\n${e.contactName}` : ""}${e.phone ? ` · ${e.phone}` : ""}`,
        buttons: [{ text: "Взять", data: `take:${e.leadId}` }, { text: "Открыть", url: e.url }],
      };
    case "lead.urgent":
    case "complaint":
      return { text: `🔴 ${e.type === "complaint" ? "Жалоба" : "Срочно"} №${e.number}\n${e.title}\nНикто не взял — напоминаем.`, buttons: [{ text: "Взять", data: `take:${e.leadId}` }, { text: "Открыть", url: e.url }] };
    case "call.missed":
      return { text: `📞 Пропущенный звонок\n${e.phone}`, buttons: [{ text: "Перезвонил", data: `called:${e.callId}` }, { text: "Открыть", url: e.url }] };
    case "limit":
      return { text: `⚠️ Израсходовано ${Math.round(e.ratio * 100)}% минут`, buttons: [{ text: "Докупить", url: e.url }] };
    case "integration.error":
      return { text: `⚠️ Ошибка интеграции «${e.key}»`, buttons: [{ text: "Исправить", url: e.url }] };
  }
}

export function parseCallback(data: string): { action: "take"; leadId: string } | { action: "called"; callId: string } | null {
  const [a, id] = data.split(":");
  if (!id) return null;
  if (a === "take") return { action: "take", leadId: id };
  if (a === "called") return { action: "called", callId: id };
  return null;
}
