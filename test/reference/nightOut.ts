/**
 * Detecció de sortides de nit i de nits fora (bivac, refugi, ruta de més d'un dia) a partir de les activitats
 * d'Strava: hora d'inici local, temps total, títol i descripció, i on comença i acaba cada sortida.
 * La descripció i les coordenades mai es publiquen: només el resultat (sí/no).
 */

export type TimedActivity = {
  id: number;
  name: string;
  description?: string | null;
  /** "2026-10-03T07:00:00Z" (Strava dona l'hora local amb una Z que no és UTC). */
  start_date_local: string;
  /** Temps total, amb aturades. */
  elapsed_time: number;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
};

const minutesOfDay = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** Si alguna part de la sortida cau entre les 22:00 i les 5:00. */
export function isNightRun(startLocal: string, elapsedS: number): boolean {
  const start = minutesOfDay(startLocal);
  const end = start + Math.round(elapsedS / 60);
  if (start < 5 * 60 || start >= 22 * 60) return true;
  return end > 22 * 60;
}

/** Si la sortida passa per la matinada (les 2:00) d'un dia a l'altre. */
function overnight(startLocal: string, elapsedS: number): boolean {
  const start = minutesOfDay(startLocal);
  const end = start + elapsedS / 60;
  return end >= 24 * 60 + 2 * 60 || (start < 2 * 60 && end >= 2 * 60);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SLEEP_WORDS =
  /\b(dormir|dormint|dormit|dormim|vaig dormir|dormida|vivac|bivac|bivouac|bivy|refugi|refugio|acampada|acampar|tenda|tienda|sleep|slept|sleeping|camping|nit fora|noche fuera)\b/;

/** Temps total a partir del qual una sortida amb paraules de dormir compta com a nit fora. */
export const SLEEP_MIN_HOURS = 10;

function km(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const addDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Activitats que inclouen una nit fora:
 *  - el títol o la descripció parlen de dormir (dormir, bivac, refugi, acampada…) i la sortida dura molt
 *    (≥ 10 h en total) o passa per la matinada;
 *  - o bé és el primer dia d'una ruta de dos dies: va d'un lloc a un altre (acaba a ≥ 5 km d'on comença), s'acaba
 *    a la tarda o al vespre i l'endemà al matí es torna a sortir a menys de 3 km d'on es va parar. Una volta que
 *    surt i torna a casa no compta, encara que l'endemà es torni a sortir de casa.
 */
export function sleptOutIds(acts: TimedActivity[]): Set<number> {
  const out = new Set<number>();
  for (const a of acts) {
    const text = fold(`${a.name} ${a.description ?? ""}`);
    if (!SLEEP_WORDS.test(text)) continue;
    if (a.elapsed_time >= SLEEP_MIN_HOURS * 3600 || overnight(a.start_date_local, a.elapsed_time)) out.add(a.id);
  }
  const sorted = [...acts].sort((x, y) => x.start_date_local.localeCompare(y.start_date_local));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a.end_latlng || !a.start_latlng || km(a.start_latlng, a.end_latlng) < 5) continue;
    const endMin = minutesOfDay(a.start_date_local) + a.elapsed_time / 60;
    if (endMin < 15 * 60) continue;
    const nextDay = addDay(a.start_date_local.slice(0, 10));
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const day = b.start_date_local.slice(0, 10);
      if (day > nextDay) break;
      if (day !== nextDay || !b.start_latlng) continue;
      if (minutesOfDay(b.start_date_local) <= 11 * 60 && km(a.end_latlng, b.start_latlng) <= 3) out.add(a.id);
    }
  }
  return out;
}
