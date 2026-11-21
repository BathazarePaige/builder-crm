"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  /** Con quien es el hilo, para que el aviso diga que se va a borrar. */
  name: string;
  messageCount: number;
}

/**
 * Menu del hilo abierto. Hoy solo eliminar, que es destructivo y por eso pide
 * confirmacion escrita en vez de un `confirm()` del navegador. Solo lo ve un admin;
 * el servidor igual lo vuelve a chequear.
 */
export function ConversationActions({ conversationId, name, messageCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Impossible de supprimer la conversation");
        return;
      }
      toast.success(
        body.messages === 1
          ? "Conversation supprimée (1 message)"
          : `Conversation supprimée (${body.messages ?? 0} messages)`
      );
      setOpen(false);
      router.push("/conversations");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Options de la conversation"
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => setOpen(true)}
            className="text-destructive cursor-pointer"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer la conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer la conversation avec {name} ?</DialogTitle>
            <DialogDescription>
              {messageCount === 1 ? "1 message" : `${messageCount} messages`} de ce fil
              seront supprimés. C’est définitif.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Le contact, ses affaires et ses documents ne sont <strong>pas</strong> touchés.
            S’il écrit à nouveau, un nouveau fil s’ouvre.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={deleting}
              className="cursor-pointer"
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
