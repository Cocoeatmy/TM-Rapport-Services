// Configuration des widgets du tableau de bord

export interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "kpis", label: "KPIs", visible: true },
  { id: "equipes", label: "Cabines par équipe", visible: true },
  { id: "series", label: "Cabines par série", visible: true },
  { id: "fournisseurs", label: "Cabines par fournisseur", visible: true },
  { id: "statuts", label: "Projets par statut", visible: true },
  { id: "soucis", label: "Taux de soucis montage", visible: true },
  { id: "sav", label: "Récurrence SAV", visible: true },
  { id: "previsions", label: "Prévisions de charge", visible: true },
  { id: "carte", label: "Carte des chantiers", visible: true },
];

const STORAGE_KEY = "tm-dashboard-widgets";

export function getWidgetConfig(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as WidgetConfig[];
      // Merge avec les defaults (au cas où on ajoute de nouveaux widgets)
      return DEFAULT_WIDGETS.map((dw) => {
        const found = saved.find((s) => s.id === dw.id);
        return found ? { ...dw, visible: found.visible } : dw;
      });
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

export function saveWidgetConfig(config: WidgetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isWidgetVisible(config: WidgetConfig[], id: string): boolean {
  return config.find((w) => w.id === id)?.visible ?? true;
}
