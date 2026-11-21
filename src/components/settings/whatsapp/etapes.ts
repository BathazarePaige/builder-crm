import type { ModoAlta } from "@/lib/channels/meta-embedded-signup";

/**
 * Lo que la ventana de Meta va a pedir, paso a paso. Se muestra al lado de la ventana
 * mientras esta abierta. Si Meta cambia su flujo, esto es lo unico que hay que tocar.
 */
export interface EtapeGuide {
  titre: string;
  detail: string;
}

const DEBUT: EtapeGuide[] = [
  {
    titre: "Connecte-toi avec Facebook et clique sur « Continuer »",
    detail: "Utilise le compte Facebook qui administre l’entreprise. Si Meta propose plusieurs profils, prends celui de l’entreprise.",
  },
  {
    titre: "Choisis ton portefeuille d’entreprise (Business)",
    detail: "Sélectionne celui de l’entreprise ou crée-le. Le nom et le site web doivent être ceux de l’entreprise réelle.",
  },
];

const COEXISTENCE: EtapeGuide[] = [
  {
    titre: "Indique que tu utilises déjà l’app WhatsApp Business",
    detail: "Meta te demande comment tu veux connecter le numéro : choisis de connecter ton app WhatsApp Business existante.",
  },
  {
    titre: "Saisis le numéro de l’app WhatsApp Business",
    detail: "Avec l’indicatif du pays, sans espaces. C’est le numéro qui est sur ton téléphone aujourd’hui.",
  },
  {
    titre: "Ouvre WhatsApp Business sur ton téléphone",
    detail: "Une notification arrive dans l’app. Ouvre-la, ou va dans Paramètres → Appareils connectés.",
  },
  {
    titre: "Scanne le QR code affiché par Meta",
    detail: "Depuis l’app WhatsApp Business. Choisis ensuite de partager l’historique des conversations si tu veux le retrouver ici.",
  },
  {
    titre: "Confirme et attends la fin",
    detail: "La fenêtre de Meta se ferme toute seule. Ne la ferme pas avant : le CRM finit la connexion juste après.",
  },
];

const NOUVEAU: EtapeGuide[] = [
  {
    titre: "Crée ou choisis le compte WhatsApp Business",
    detail: "Donne un nom d’affichage : c’est celui que verront tes clients. Meta le vérifie, évite les noms génériques.",
  },
  {
    titre: "Ajoute le numéro",
    detail: "Il ne doit pas être actif sur WhatsApp ni sur WhatsApp Business. S’il l’est, supprime d’abord le compte dans l’app.",
  },
  {
    titre: "Vérifie le numéro par SMS ou appel",
    detail: "Saisis le code à 6 chiffres que Meta envoie à ce numéro.",
  },
  {
    titre: "Accepte les autorisations",
    detail: "Laisse toutes les cases cochées : le CRM a besoin de gérer les messages et le compte WhatsApp Business.",
  },
  {
    titre: "Confirme et attends la fin",
    detail: "La fenêtre de Meta se ferme toute seule. Ne la ferme pas avant : le CRM enregistre le numéro juste après.",
  },
];

export function etapesGuide(modo: ModoAlta): EtapeGuide[] {
  return [...DEBUT, ...(modo === "coexistencia" ? COEXISTENCE : NOUVEAU)];
}

/** Ce que l’explication résume avant d’ouvrir Meta. */
export function resumeAvantMeta(modo: ModoAlta): string[] {
  return modo === "coexistencia"
    ? [
        "Te connecter avec Facebook.",
        "Choisir ton entreprise et ton compte WhatsApp Business.",
        "Saisir le numéro de ton app WhatsApp Business.",
        "Scanner un QR code avec ton téléphone.",
      ]
    : [
        "Te connecter avec Facebook.",
        "Créer ou choisir ton compte WhatsApp Business.",
        "Ajouter le numéro et le vérifier par SMS ou appel.",
      ];
}
