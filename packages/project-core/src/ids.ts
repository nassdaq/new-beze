const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export type IdPrefix = 'prj' | 'scn' | 'ent' | 'chr' | 'map' | 'tls' | 'lyr' | 'dlg' | 'nod' | 'var' | 'qst' | 'ast';

/** Time-sortable opaque id: `<prefix>_<base36 ms timestamp><10 random chars>`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${Date.now().toString(36)}${randomChars(10)}`;
}
