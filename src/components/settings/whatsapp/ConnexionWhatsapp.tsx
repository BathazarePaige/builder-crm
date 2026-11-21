"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Hash, KeyRound, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "@/components/icons/channels";
import {
  leerEventoSignup,
  opcionesLogin,
  type EventoSignup,
  type ModoAlta,
} from "@/lib/channels/meta-embedded-signup";
import { abrirVentanaMeta, cargarSdkFacebook } from "./sdk-facebook";
import { etapesGuide, resumeAvantMeta } from "./etapes";

export interface ConfigSignup {
  appId: string | null;
  configId: string | null;
  faltan: string[];
}

type Ecran = "choix" | "explication" | "guide" | "fin";

interface Resultat {
  numero: string;
  pin: string | null;
  avisos: string[];
}

/**
 * Assistant "Connecter WhatsApp" : choix du numéro, explication de ce que Meta va
 * demander, puis guide pas à pas à côté de la fenêtre de Meta (Embedded Signup). Le
 * code de Meta part au serveur, qui l’échange contre le jeton : rien de secret ici.
 */
export function ConnexionWhatsapp({
  open,
  onOpenChange,
  signup,
  onManuel,
  onConnecte,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signup: ConfigSignup;
  onManuel: () => void;
  onConnecte: () => void;
}) {
  const [ecran, setEcran] = useState<Ecran>("choix");
  const [modo, setModo] = useState<ModoAlta>("coexistencia");
  const [compris, setCompris] = useState(false);
  const [etape, setEtape] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const evenement = useRef<EventoSignup | null>(null);

  const pret = signup.faltan.length === 0 && signup.appId && signup.configId;

  // Précharge du SDK dès l’ouverture : FB.login doit partir dans le clic.
  useEffect(() => {
    if (open && pret && signup.appId) cargarSdkFacebook(signup.appId).catch(() => {});
  }, [open, pret, signup.appId]);

  // Meta annonce phone_number_id et waba_id par postMessage pendant que sa fenêtre est ouverte.
  useEffect(() => {
    if (!open) return;
    const ecouter = (e: MessageEvent) => {
      const ev = leerEventoSignup(e.origin, e.data);
      if (ev) evenement.current = ev;
    };
    window.addEventListener("message", ecouter);
    return () => window.removeEventListener("message", ecouter);
  }, [open]);

  const fermer = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setEcran("choix");
      setCompris(false);
      setEtape(0);
      setResultat(null);
    }
  };

  const ouvrirMeta = async () => {
    if (!signup.configId || !window.FB) {
      toast.error("La fenêtre de Meta n’est pas encore prête, réessaie dans une seconde.");
      if (signup.appId) cargarSdkFacebook(signup.appId).catch((e: Error) => toast.error(e.message));
      return;
    }
    evenement.current = null;
    setEnCours(true);
    try {
      const code = await abrirVentanaMeta(opcionesLogin(modo, signup.configId));
      const ev = await attendreEvenement(evenement);
      if (!code || ev?.tipo !== "fin") {
        toast.error(messageEchec(ev, Boolean(code)));
        return;
      }
      const res = await fetch("/api/channels/meta/embedded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phoneNumberId: ev.phoneNumberId, wabaId: ev.wabaId, modo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "La connexion a échoué");
        return;
      }
      setResultat({
        numero: json.cuenta?.displayPhone ?? ev.phoneNumberId,
        pin: json.pin ?? null,
        avisos: json.avisos ?? [],
      });
      setEcran("fin");
      onConnecte();
    } finally {
      setEnCours(false);
    }
  };

  const etapes = etapesGuide(modo);
  const retour: Record<Ecran, Ecran | null> = { choix: null, explication: "choix", guide: "explication", fin: null };

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {retour[ecran] && (
              <Button variant="ghost" size="icon-sm" onClick={() => setEcran(retour[ecran]!)} aria-label="Retour">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <ChannelIcon channel="whatsapp" className="h-4 w-4" />
            <DialogTitle>Connecter WhatsApp</DialogTitle>
          </div>
          <DialogDescription>
            {ecran === "choix" && "Où est ton numéro aujourd’hui ?"}
            {ecran === "explication" && "À lire avant de continuer"}
            {ecran === "guide" && "Suis les étapes dans la fenêtre de Meta"}
            {ecran === "fin" && "C’est fait"}
          </DialogDescription>
        </DialogHeader>

        {ecran === "choix" && (
          <div className="space-y-2">
            {!pret && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                La fenêtre de Meta n’est pas configurée sur cette instance (manque {signup.faltan.join(", ")}). Tu peux
                quand même connecter le numéro avec ses identifiants.
              </p>
            )}
            <Option
              icone={<Smartphone className="h-4 w-4" />}
              titre="Je discute depuis l’app WhatsApp Business"
              badge="Coexistence"
              texte="L’app reste sur ton téléphone et continue de fonctionner. Le CRM se connecte à côté : rien ne change pour toi ni pour tes clients."
              desactive={!pret}
              onClick={() => { setModo("coexistencia"); setEcran("explication"); }}
            />
            <Option
              icone={<Hash className="h-4 w-4" />}
              titre="J’ai un numéro qui n’est pas sur WhatsApp"
              texte="Un numéro neuf ou libéré. Meta le vérifie par SMS ou appel et il ne vivra que dans le CRM (pas dans l’app)."
              desactive={!pret}
              onClick={() => { setModo("nuevo"); setEcran("explication"); }}
            />
            <Option
              icone={<KeyRound className="h-4 w-4" />}
              titre="J’ai déjà les identifiants Cloud API"
              texte="Avancé : coller l’identifiant du numéro, le WABA et un jeton permanent d’utilisateur système."
              onClick={() => { fermer(false); onManuel(); }}
            />
          </div>
        )}

        {ecran === "explication" && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Une fenêtre de Meta va s’ouvrir. Elle prend 2 à 3 minutes et te demandera de :
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-[13px]">
              {resumeAvantMeta(modo).map((t) => <li key={t}>{t}</li>)}
            </ol>
            {modo === "coexistencia" && (
              <p className="text-[12px] text-muted-foreground">
                Garde ton téléphone à portée de main avec WhatsApp Business ouvert et à jour.
              </p>
            )}
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5" checked={compris} onChange={(e) => setCompris(e.target.checked)} />
              J’ai compris comment se déroule la configuration.
            </label>
            <Button className="w-full" disabled={!compris || enCours} onClick={() => { setEcran("guide"); ouvrirMeta(); }}>
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continuer vers la configuration WhatsApp
            </Button>
            <Button className="w-full" variant="outline" disabled={!compris} onClick={() => setEcran("guide")}>
              Je veux être guidé pas à pas
            </Button>
          </div>
        )}

        {ecran === "guide" && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              Garde ce guide visible à côté de la fenêtre de Meta : il reste ici pendant toute la configuration.
            </p>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Étape {etape + 1} sur {etapes.length}</span>
              <span className="flex gap-1">
                {etapes.map((_, i) => (
                  <span key={i} className={cn("h-1.5 rounded-full", i === etape ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
                ))}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="flex gap-2 text-sm font-medium">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {etape + 1}
                </span>
                {etapes[etape].titre}
              </p>
              <p className="mt-1.5 pl-7 text-[12px] text-muted-foreground">{etapes[etape].detail}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={etape === 0} onClick={() => setEtape(etape - 1)}>
                Précédent
              </Button>
              <Button variant="outline" size="sm" className="ml-auto" disabled={etape === etapes.length - 1} onClick={() => setEtape(etape + 1)}>
                Étape suivante
              </Button>
            </div>
            <Button className="w-full" disabled={enCours} onClick={ouvrirMeta}>
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {enCours ? "Fenêtre de Meta ouverte…" : "Ouvrir la fenêtre de Meta"}
            </Button>
          </div>
        )}

        {ecran === "fin" && resultat && (
          <div className="space-y-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4 text-emerald-600" />
              WhatsApp {resultat.numero} est connecté.
            </p>
            {resultat.pin && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                Code PIN de vérification en deux étapes : <span className="font-mono font-semibold">{resultat.pin}</span>.
                Note-le : Meta le demandera si le numéro doit être réenregistré. Il n’est affiché qu’une fois.
              </p>
            )}
            {resultat.avisos.map((a) => (
              <p key={a} className="text-[12px] text-amber-700">{a}</p>
            ))}
            <Button className="w-full" onClick={() => fermer(false)}>Terminer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Option({
  icone,
  titre,
  texte,
  badge,
  desactive,
  onClick,
}: {
  icone: React.ReactNode;
  titre: string;
  texte: string;
  badge?: string;
  desactive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={desactive}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {titre}
          {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">{texte}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** L’événement de Meta peut arriver juste après le rappel de FB.login : on lui laisse 3 s. */
async function attendreEvenement(ref: { current: EventoSignup | null }): Promise<EventoSignup | null> {
  for (let i = 0; i < 30 && !ref.current; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return ref.current;
}

function messageEchec(ev: EventoSignup | null, aCode: boolean): string {
  if (ev?.tipo === "cancelado") return "Tu as fermé la fenêtre de Meta avant la fin. Recommence quand tu veux.";
  if (ev?.tipo === "error") return `Meta a renvoyé une erreur : ${ev.mensaje}`;
  if (ev?.tipo === "fin_sin_numero") return "Le compte WhatsApp Business est créé, mais aucun numéro n’a été ajouté. Recommence et ajoute le numéro.";
  return aCode
    ? "Meta n’a pas indiqué quel numéro a été connecté. Recommence."
    : "La fenêtre de Meta s’est fermée sans terminer.";
}
