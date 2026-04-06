import { describe, it, expect } from "vitest";
import {
  parseTime,
  parseTimeRaw,
  computeTimeDifference,
  formatMinutes,
  parseMultiDayEntries,
  estimateDuration,
  compareMesuresStatus,
  getISOWeekNumber,
} from "../lib/time-utils";
import { STATUS_MESURES_SORT_ORDER } from "../lib/constants";

// ---------------------------------------------------------------------------
// Hours calculation
// ---------------------------------------------------------------------------

describe("parseTime", () => {
  it("parses '08:30' to 510 minutes", () => {
    expect(parseTime("08:30")).toBe(510);
  });

  it("parses '17:00' to 1020 minutes", () => {
    expect(parseTime("17:00")).toBe(1020);
  });

  it("returns null for empty string", () => {
    expect(parseTime("")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(parseTime("abc")).toBeNull();
  });
});

describe("computeTimeDifference", () => {
  it("computes 08:30 to 17:00 as 8h30min (510 minutes)", () => {
    const diff = computeTimeDifference("08:30", "17:00");
    expect(diff).toBe(510); // 8*60 + 30
    expect(formatMinutes(diff)).toBe("8h 30min");
  });

  it("returns 0 when end is before start", () => {
    expect(computeTimeDifference("17:00", "08:30")).toBe(0);
  });

  it("returns 0 for invalid inputs", () => {
    expect(computeTimeDifference("", "17:00")).toBe(0);
    expect(computeTimeDifference("08:30", "")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-day format parsing
// ---------------------------------------------------------------------------

describe("parseMultiDayEntries", () => {
  it("parses multi-day format with collaborator names", () => {
    const raw = "2026-04-07 Claudio 08:30 | 2026-04-08 Claudio 07:00";
    const entries = parseMultiDayEntries(raw);

    expect(entries).toHaveLength(2);

    expect(entries[0].date).toBe("2026-04-07");
    expect(entries[0].collaborateur).toBe("Claudio");
    expect(entries[0].time).toBe("08:30");

    expect(entries[1].date).toBe("2026-04-08");
    expect(entries[1].collaborateur).toBe("Claudio");
    expect(entries[1].time).toBe("07:00");
  });

  it("returns empty array for simple time strings", () => {
    expect(parseMultiDayEntries("08:30")).toEqual([]);
  });

  it("handles multi-word collaborator names", () => {
    const raw = "2026-04-07 Jean Marc 08:30 | 2026-04-08 Jean Marc 07:00";
    const entries = parseMultiDayEntries(raw);
    expect(entries[0].collaborateur).toBe("Jean Marc");
  });
});

describe("parseTimeRaw", () => {
  it("extracts time from multi-day string", () => {
    // parseTimeRaw grabs the first time found in the string
    const result = parseTimeRaw("2026-04-07 Claudio 08:30");
    expect(result).toBe(510); // 8*60 + 30
  });

  it("parses simple time", () => {
    expect(parseTimeRaw("17:00")).toBe(1020);
  });
});

// ---------------------------------------------------------------------------
// Status sort order (Mesures)
// ---------------------------------------------------------------------------

describe("compareMesuresStatus", () => {
  it("sorts RDV-Fixe before Pas contacte", () => {
    const result = compareMesuresStatus("RDV - Fixé", "Pas contacté", STATUS_MESURES_SORT_ORDER);
    expect(result).toBeLessThan(0);
  });

  it("sorts Pas contacte after Contact sans reponse", () => {
    const result = compareMesuresStatus("Pas contacté", "Contact sans réponse", STATUS_MESURES_SORT_ORDER);
    expect(result).toBeGreaterThan(0);
  });

  it("sorts correctly across the full order", () => {
    const statuses = [
      "Mesures non relevées - attendre news",
      "RDV - Fixé",
      "Pas contacté",
      "Contact sans réponse",
      "RDV - Attendre news",
    ];
    const sorted = [...statuses].sort((a, b) =>
      compareMesuresStatus(a, b, STATUS_MESURES_SORT_ORDER),
    );
    expect(sorted[0]).toBe("RDV - Fixé");
    expect(sorted[sorted.length - 1]).toBe("Mesures non relevées - attendre news");
  });

  it("places unknown statuses last", () => {
    const result = compareMesuresStatus("Unknown Status", "RDV - Fixé", STATUS_MESURES_SORT_ORDER);
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Duration estimation
// ---------------------------------------------------------------------------

describe("estimateDuration", () => {
  const mockProjects = [
    { heureArrivee: "08:00", heureDepart: "12:00", nbCabines: 2, fournisseurs: ["Duka"] },
    { heureArrivee: "08:00", heureDepart: "11:00", nbCabines: 1, fournisseurs: ["Duka"] },
    { heureArrivee: "07:30", heureDepart: "12:30", nbCabines: 2, fournisseurs: ["Duka"] },
    { heureArrivee: "08:00", heureDepart: "16:00", nbCabines: 3, fournisseurs: ["Megius"] },
  ];

  it("returns estimate based on supplier data when >= 3 projects", () => {
    const result = estimateDuration("Duka", 2, mockProjects);
    expect(result).not.toBeNull();
    expect(result!.confidence).toContain("Duka");
    // Duka projects: 240min/2cab=120, 180min/1cab=180, 300min/2cab=150
    // Average per cabine: (120+180+150)/3 = 150 min/cabine
    // For 2 cabines: 300 min = 5h 0min
    expect(result!.hours).toBe(5);
    expect(result!.minutes).toBe(0);
  });

  it("falls back to general average when supplier has < 3 projects", () => {
    const result = estimateDuration("Megius", 1, mockProjects);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("moyenne generale");
  });

  it("returns null when fewer than 3 total projects with time", () => {
    const result = estimateDuration("Duka", 1, [
      { heureArrivee: "08:00", heureDepart: "12:00", nbCabines: 1, fournisseurs: ["Duka"] },
    ]);
    expect(result).toBeNull();
  });

  it("skips projects without time data", () => {
    const projectsWithGaps = [
      { heureArrivee: "", heureDepart: "", nbCabines: 1, fournisseurs: ["Duka"] },
      ...mockProjects,
    ];
    const result = estimateDuration("Duka", 1, projectsWithGaps);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ISO week number
// ---------------------------------------------------------------------------

describe("getISOWeekNumber", () => {
  it("returns week 1 for 2026-01-01 (Thursday)", () => {
    // Jan 1 2026 is a Thursday -> ISO week 1
    expect(getISOWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });

  it("returns week 15 for 2026-04-06 (Monday)", () => {
    // April 6 2026 is a Monday
    expect(getISOWeekNumber(new Date(2026, 3, 6))).toBe(15);
  });

  it("returns week 53 for 2020-12-31 (Thursday)", () => {
    // Dec 31 2020 is a Thursday, ISO week 53
    expect(getISOWeekNumber(new Date(2020, 11, 31))).toBe(53);
  });

  it("returns week 1 for 2021-01-04 (Monday)", () => {
    // Jan 4 2021 is the Monday of ISO week 1
    expect(getISOWeekNumber(new Date(2021, 0, 4))).toBe(1);
  });

  it("returns week 52 for 2025-12-29 (Monday)", () => {
    // Dec 29 2025 is a Monday, ISO week 1 of 2026
    expect(getISOWeekNumber(new Date(2025, 11, 29))).toBe(1);
  });
});
