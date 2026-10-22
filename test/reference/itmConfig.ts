/**
 * Els números de l'ITM i dels requisits de preparació, en un sol objecte que es pot ajustar des de l'MCP (es
 * desa a la base de dades). Els valors per defecte són els calibrats amb l'historial d'Strava; un ajust només
 * canvia els camps que porta i la resta queden com eren.
 */

export type ItmKey = "20k" | "50k" | "100k" | "100m" | "utmb";

export const ITM_KEYS: ItmKey[] = ["20k", "50k", "100k", "100m", "utmb"];

export type ItmLevelParams = {
  /** ITM a partir del qual es té la forma d'aquest nivell. */
  threshold: number;
  /** Km esforç mínims d'una sortida d'aquesta categoria. */
  minEffort: number;
  /** Dies sense deteriorament després d'una sortida d'aquesta categoria. */
  grace: number;
};

export type ReadinessRule = {
  /** Sortida més llarga (km esforç) en les últimes 12 setmanes. */
  longest: number;
  /** Doblet: dos dies seguits sumant (km esforç), en 12 setmanes. */
  backToBack?: number;
  /** Acumulat de km esforç de les últimes 12 setmanes. */
  accumulated: number;
  /** Sortides de nit en els últims 12 mesos. */
  nights?: number;
  /** Nits fora en els últims 12 mesos. */
  sleptOut?: number;
  /** Mitjana setmanal de mobilitat o força en les últimes 8 setmanes. */
  support?: number;
  /** Cursa acabada d'alguna d'aquestes categories en els últims 24 mesos. */
  previousRace?: ItmKey[];
};

export type ItmConfig = {
  /** Deteriorament diari, com a fracció de l'ITM (0,02 = 2 %). */
  decay: number;
  /** Fre màxim del suport (força, mobilitat, natació, sortides curtes): el deteriorament es multiplica per això. */
  supportFactor: number;
  /** Sessions de suport recents per arribar al fre màxim (amb menys, el fre és proporcional). */
  supportFull: number;
  /** Dies en què una sessió de suport perd la meitat del seu efecte (es va esvaint, sense salts). */
  supportHalfLife: number;
  /** Dies (passat el marge de l'última sortida de categoria) en què el fre del suport s'apaga del tot, a poc a poc. */
  supportWindow: number;
  /** Un nivell no es perd fins que l'ITM cau per sota d'aquesta fracció del seu llindar. */
  cushion: number;
  /** Distància mínima (km) perquè una sortida de córrer sense categoria es mostri com a sortida que suma. */
  shortMinKm: number;
  /** Altitud de casa (m): la dels dies sense cap estada a la muntanya (Barcelona). */
  homeAltitude: number;
  /** Altitud (m) a partir de la qual l'altitud té efecte. */
  altitudeFrom: number;
  /** Les sortides per sobre d'`altitudeFrom` sumen aquesta fracció més per cada 1.000 m de més… */
  altitudeTrainingPer1000: number;
  /** …fins a aquest màxim (0,3 = un 30 % més). */
  altitudeTrainingMax: number;
  /** Dormint per sobre d'`altitudeFrom`, el deteriorament baixa aquesta fracció per cada 1.000 m de més… */
  altitudeStayPer1000: number;
  /** …fins a aquest màxim (0,5 = la meitat). */
  altitudeStayMax: number;
  /** Dies que dura (i s'esvaeix) l'efecte d'una estada en altitud després de baixar. */
  altitudeAfterDays: number;
  levels: Record<ItmKey, ItmLevelParams>;
  readiness: Record<ItmKey, ReadinessRule>;
};

export const DEFAULT_ITM_CONFIG: ItmConfig = {
  decay: 0.02,
  supportFactor: 0.5,
  supportFull: 2,
  supportHalfLife: 7,
  supportWindow: 42,
  cushion: 0.8,
  shortMinKm: 9,
  homeAltitude: 12,
  altitudeFrom: 1500,
  altitudeTrainingPer1000: 0.15,
  altitudeTrainingMax: 0.3,
  altitudeStayPer1000: 0.3,
  altitudeStayMax: 0.5,
  altitudeAfterDays: 14,
  levels: {
    "20k": { threshold: 110, minEffort: 20, grace: 3 },
    "50k": { threshold: 250, minEffort: 45, grace: 5 },
    "100k": { threshold: 500, minEffort: 75, grace: 7 },
    "100m": { threshold: 850, minEffort: 155, grace: 14 },
    utmb: { threshold: 1200, minEffort: 278, grace: 21 },
  },
  readiness: {
    "20k": { longest: 15, accumulated: 150 },
    "50k": { longest: 30, accumulated: 350 },
    "100k": {
      longest: 50,
      backToBack: 60,
      accumulated: 650,
      nights: 1,
      support: 1,
      previousRace: ["50k", "100k", "100m", "utmb"],
    },
    "100m": {
      longest: 70,
      backToBack: 90,
      accumulated: 950,
      nights: 2,
      sleptOut: 1,
      support: 1.5,
      previousRace: ["100k", "100m", "utmb"],
    },
    utmb: {
      longest: 90,
      backToBack: 110,
      accumulated: 1200,
      nights: 2,
      sleptOut: 1,
      support: 2,
      previousRace: ["100k", "100m", "utmb"],
    },
  },
};

/** Ajust parcial: només els camps que es volen canviar. Un requisit a null el treu. */
export type ItmConfigPatch = Partial<Omit<ItmConfig, "levels" | "readiness">> & {
  levels?: Partial<Record<ItmKey, Partial<ItmLevelParams>>>;
  readiness?: Partial<Record<ItmKey, { [K in keyof ReadinessRule]?: ReadinessRule[K] | null }>>;
};

const OPTIONAL_RULES = ["backToBack", "nights", "sleptOut", "support", "previousRace"] as const;

/** Aplica un ajust sobre una configuració (sense modificar-la). */
export function mergeItmConfig(base: ItmConfig, patch: ItmConfigPatch | null | undefined): ItmConfig {
  if (!patch) return base;
  const { levels, readiness, ...scalars } = patch;
  const defined = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
  const out: ItmConfig = {
    ...base,
    ...defined(scalars),
    levels: { ...base.levels },
    readiness: { ...base.readiness },
  };
  for (const key of ITM_KEYS) {
    const l = levels?.[key];
    if (l) out.levels[key] = { ...base.levels[key], ...defined(l) };
    const r = readiness?.[key];
    if (r) {
      const rule = { ...base.readiness[key], ...defined(r) } as Record<string, unknown>;
      for (const k of OPTIONAL_RULES) if (rule[k] === null) delete rule[k];
      out.readiness[key] = rule as ReadinessRule;
    }
  }
  return out;
}

/** Errors d'una configuració (llista buida si és vàlida). */
export function validateItmConfig(c: ItmConfig): string[] {
  const errors: string[] = [];
  const between = (name: string, v: number, min: number, max: number) => {
    if (!Number.isFinite(v) || v < min || v > max) errors.push(`${name} ha de ser entre ${min} i ${max}.`);
  };
  between("decay", c.decay, 0.001, 0.2);
  between("supportFactor", c.supportFactor, 0, 1);
  between("supportFull", c.supportFull, 0.5, 20);
  between("supportHalfLife", c.supportHalfLife, 1, 60);
  between("supportWindow", c.supportWindow, 1, 365);
  between("cushion", c.cushion, 0.3, 1);
  between("shortMinKm", c.shortMinKm, 0, 100);
  between("homeAltitude", c.homeAltitude, -500, 9000);
  between("altitudeFrom", c.altitudeFrom, 0, 9000);
  between("altitudeTrainingPer1000", c.altitudeTrainingPer1000, 0, 1);
  between("altitudeTrainingMax", c.altitudeTrainingMax, 0, 1);
  between("altitudeStayPer1000", c.altitudeStayPer1000, 0, 1);
  between("altitudeStayMax", c.altitudeStayMax, 0, 0.9);
  between("altitudeAfterDays", c.altitudeAfterDays, 0, 90);
  ITM_KEYS.forEach((key, i) => {
    const l = c.levels[key];
    between(`levels.${key}.threshold`, l.threshold, 1, 100_000);
    between(`levels.${key}.minEffort`, l.minEffort, 1, 1_000);
    between(`levels.${key}.grace`, l.grace, 0, 120);
    const prev = i > 0 ? c.levels[ITM_KEYS[i - 1]] : null;
    if (prev && l.threshold <= prev.threshold)
      errors.push(`El llindar de ${key} (${l.threshold}) ha de ser més alt que el de ${ITM_KEYS[i - 1]}.`);
    if (prev && l.minEffort <= prev.minEffort)
      errors.push(`Els km esforç mínims de ${key} (${l.minEffort}) han de ser més alts que els de ${ITM_KEYS[i - 1]}.`);
    const r = c.readiness[key];
    between(`readiness.${key}.longest`, r.longest, 0, 1_000);
    between(`readiness.${key}.accumulated`, r.accumulated, 0, 20_000);
    if (r.backToBack !== undefined) between(`readiness.${key}.backToBack`, r.backToBack, 0, 2_000);
    if (r.nights !== undefined) between(`readiness.${key}.nights`, r.nights, 0, 50);
    if (r.sleptOut !== undefined) between(`readiness.${key}.sleptOut`, r.sleptOut, 0, 50);
    if (r.support !== undefined) between(`readiness.${key}.support`, r.support, 0, 14);
    if (r.previousRace && (r.previousRace.length === 0 || r.previousRace.some((k) => !ITM_KEYS.includes(k))))
      errors.push(`readiness.${key}.previousRace ha de tenir categories vàlides (${ITM_KEYS.join(", ")}).`);
  });
  return errors;
}

type ScalarKey = Exclude<keyof ItmConfig, "levels" | "readiness">;
const SCALAR_KEYS = (Object.keys(DEFAULT_ITM_CONFIG) as (keyof ItmConfig)[]).filter(
  (k): k is ScalarKey => k !== "levels" && k !== "readiness",
);

/** El que es desa: només el que és diferent dels valors per defecte (per poder canviar-los més endavant). */
export function diffFromDefault(c: ItmConfig): ItmConfigPatch {
  const patch: ItmConfigPatch = {};
  for (const k of SCALAR_KEYS) if (c[k] !== DEFAULT_ITM_CONFIG[k]) patch[k] = c[k];
  for (const key of ITM_KEYS) {
    const l = c.levels[key];
    const d = DEFAULT_ITM_CONFIG.levels[key];
    const changed = Object.fromEntries(
      (Object.keys(d) as (keyof ItmLevelParams)[]).filter((k) => l[k] !== d[k]).map((k) => [k, l[k]]),
    );
    if (Object.keys(changed).length) (patch.levels ??= {})[key] = changed;
    const r = c.readiness[key] as Record<string, unknown>;
    const dr = DEFAULT_ITM_CONFIG.readiness[key] as Record<string, unknown>;
    const keys = new Set([...Object.keys(r), ...Object.keys(dr)]);
    const rChanged: Record<string, unknown> = {};
    for (const k of keys)
      if (JSON.stringify(r[k]) !== JSON.stringify(dr[k])) rChanged[k] = r[k] === undefined ? null : r[k];
    if (Object.keys(rChanged).length) (patch.readiness ??= {})[key] = rChanged;
  }
  return patch;
}
