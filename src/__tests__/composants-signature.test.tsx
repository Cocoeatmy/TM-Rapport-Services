/**
 * Le pavé de signature, monté pour de bon.
 *
 * Premier test de composant de ce dépôt. Il porte sur la pièce la plus
 * sensible : une signature est la preuve d'acceptation des travaux, et son
 * écran doit dire la vérité sur ce qu'il a — « rien encore », « signé »,
 * « déjà signé la dernière fois ».
 *
 * jsdom ne dessine pas : `canvas.getContext("2d")` y rend `null`. On fournit
 * donc un contexte minimal pour que le composant se comporte comme dans un
 * navigateur. Ce qu'on vérifie n'est pas le tracé — c'est l'enchaînement des
 * états et ce qui remonte à l'appelant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignaturePad } from "@/components/signature-pad";

const DATA_URL = "data:image/png;base64,FAUSSESIGNATURE";

/**
 * Le composant prépare son canvas à la frame suivante, puis seulement alors
 * attache les écouteurs de dessin. Dispatcher un événement avant cela ne
 * produit rien — et donnait trois échecs qui n'en étaient pas.
 */
async function attendrePret() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

beforeEach(() => {
  /* Un contexte de dessin juste assez complet pour que le composant vive. */
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), drawImage: vi.fn(),
    lineCap: "", lineJoin: "", lineWidth: 0, strokeStyle: "", fillStyle: "",
    globalCompositeOperation: "",
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => DATA_URL);
  /* jsdom rend 0 partout : le composant refuse d'initialiser un canvas de
     largeur nulle, comme il le ferait face à un élément non encore visible. */
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600, height: 200, top: 0, left: 0, right: 600, bottom: 200, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

describe("au premier affichage", () => {
  it("invite à signer et ne propose pas encore de valider", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText("Signez ici")).toBeInTheDocument();
    expect(screen.queryByText(/Valider la signature/)).not.toBeInTheDocument();
  });

  it("affiche le libellé qu'on lui donne", () => {
    render(<SignaturePad onSave={vi.fn()} label="Signature du client" />);
    expect(screen.getByText("Signature du client")).toBeInTheDocument();
  });

  it("n'affiche aucun libellé quand on n'en veut pas", () => {
    const { container } = render(<SignaturePad onSave={vi.fn()} label="" />);
    expect(container.querySelector("label")).toBeNull();
  });
});

describe("quand une signature existe déjà", () => {
  it("n'invite plus à signer", () => {
    render(<SignaturePad onSave={vi.fn()} existingSignature="https://c.test/sig.png" />);
    expect(screen.queryByText("Signez ici")).not.toBeInTheDocument();
  });

  it("se met à jour si elle arrive APRÈS le montage", () => {
    /* Cas réel : la signature vient du serveur, ou de la file d'envoi, une
       seconde après l'affichage de la fiche. L'invitation doit disparaître. */
    const { rerender } = render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText("Signez ici")).toBeInTheDocument();
    rerender(<SignaturePad onSave={vi.fn()} existingSignature="https://c.test/sig.png" />);
    expect(screen.queryByText("Signez ici")).not.toBeInTheDocument();
  });
});

describe("signer puis valider", () => {
  it("remonte une image à l'appelant, et une seule fois", async () => {
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} />);
    await attendrePret();
    const canvas = container.querySelector("canvas")!;

    /* Un trait : appui, déplacement, relâchement. */
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 30 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    const valider = await screen.findByText(/Valider la signature/);
    await userEvent.click(valider);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(DATA_URL);
  });

  it("efface ce qui a été tracé et redemande une signature", async () => {
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} />);
    await attendrePret();
    const canvas = container.querySelector("canvas")!;
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    await userEvent.click(await screen.findByText("Effacer"));

    expect(screen.getByText("Signez ici")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("dit « apposée », pas « enregistrée » : il ne sait pas si c'est parti", async () => {
    /* La nuance compte : seule la fiche sait si la signature a quitté
       l'appareil. Le pavé, lui, ne connaît que son tracé. */
    const { container } = render(<SignaturePad onSave={vi.fn()} />);
    await attendrePret();
    const canvas = container.querySelector("canvas")!;
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 8, clientY: 8 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await userEvent.click(await screen.findByText(/Valider la signature/));
    expect(screen.getByText("Signature apposée")).toBeInTheDocument();
    expect(screen.queryByText("Signature enregistrée")).not.toBeInTheDocument();
  });

  it("ne valide RIEN quand on n'a pas signé", () => {
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} />);
    expect(screen.queryByText(/Valider la signature/)).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("quand l'export de l'image échoue", () => {
  it("ne prétend PAS avoir enregistré, et laisse recommencer", async () => {
    /* Un canvas « souillé » par une image d'une autre origine fait échouer
       `toDataURL`. L'écran doit revenir à l'état « pas de signature »
       plutôt que d'afficher une validation qui n'a rien produit. */
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
      throw new Error("SecurityError: tainted canvas");
    });
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} />);
    await attendrePret();
    const canvas = container.querySelector("canvas")!;
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 5, clientY: 5 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    await userEvent.click(await screen.findByText(/Valider la signature/));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Signez ici")).toBeInTheDocument();
  });
});

describe("au doigt", () => {
  it("un tracé tactile vaut un tracé à la souris", async () => {
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} />);
    await attendrePret();
    const canvas = container.querySelector("canvas")!;

    const toucher = (type: string, x: number, y: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent & {
        touches: { clientX: number; clientY: number }[];
      };
      Object.defineProperty(e, "touches", { value: [{ clientX: x, clientY: y }] });
      canvas.dispatchEvent(e);
    };
    toucher("touchstart", 20, 20);
    toucher("touchmove", 50, 40);
    canvas.dispatchEvent(new Event("touchend", { bubbles: true }));

    await userEvent.click(await screen.findByText(/Valider la signature/));
    expect(onSave).toHaveBeenCalledWith(DATA_URL);
  });
});
