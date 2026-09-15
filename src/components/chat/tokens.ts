// Převod mezi tím, co uživatel píše („@Petr Novák“, „#marketing“, „@kanal“),
// a uloženými tokeny (`<@userId>`, `<#channelId>`, `<!kanal>`). Tokeny drží
// odkaz na id, takže přejmenování člověka nebo kanálu staré zprávy nerozbije.

export type PickedMentions = Map<string, string>; // label (bez @) → userId

export function encodeMessage(text: string, picked: PickedMentions, channelIdByName: Map<string, string>) {
  let out = text;
  // Delší jména první — „@Jan Novák“ se nesmí rozbít na „@Jan“.
  for (const [label, id] of [...picked.entries()].sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(`@${label}`).join(`<@${id}>`);
  }
  out = out.replace(/(^|\s)@kanal(?![\p{L}\p{N}_-])/gu, "$1<!kanal>");
  out = out.replace(/(^|\s)#([a-z0-9_-]+)/g, (m, pre: string, name: string) => {
    const id = channelIdByName.get(name);
    return id ? `${pre}<#${id}>` : m;
  });
  return out;
}

/** Pro editaci: tokeny zpět na čitelný text + mapa zmínek, aby šly znovu zakódovat. */
export function decodeMessage(
  text: string,
  userName: (id: string) => string,
  channelName: (id: string) => string | undefined,
) {
  const picked: PickedMentions = new Map();
  const plain = text
    .replace(/<@([a-z0-9]+)>/g, (_, id: string) => {
      const label = userName(id);
      picked.set(label, id);
      return `@${label}`;
    })
    .replace(/<#([a-z0-9]+)>/g, (_, id: string) => `#${channelName(id) ?? "kanál"}`)
    .replaceAll("<!kanal>", "@kanal");
  return { plain, picked };
}

/** Porovnání bez diakritiky a velikosti písmen („lorinc“ najde „Lořinc“). */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function pluralReplies(n: number) {
  if (n === 1) return "1 odpověď";
  if (n >= 2 && n <= 4) return `${n} odpovědi`;
  return `${n} odpovědí`;
}
