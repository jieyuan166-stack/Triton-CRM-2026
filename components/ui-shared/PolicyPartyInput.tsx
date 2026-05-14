"use client";

import { Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientCombobox } from "@/components/ui-shared/ClientCombobox";
import { clientFullName } from "@/lib/policy-parties";
import type { Client } from "@/lib/types";

interface PolicyPartyInputProps {
  id: string;
  clients: Client[];
  nameValue?: string;
  clientIdValue?: string;
  onNameChange: (name: string) => void;
  onClientSelect: (clientId: string, displayName: string) => void;
  onClearClient: () => void;
  placeholder?: string;
  disabledClientId?: string;
}

export function PolicyPartyInput({
  id,
  clients,
  nameValue = "",
  clientIdValue = "",
  onNameChange,
  onClientSelect,
  onClearClient,
  placeholder = "Type a name or select a client",
  disabledClientId,
}: PolicyPartyInputProps) {
  const selectableClients = disabledClientId
    ? clients.filter((client) => client.id !== disabledClientId)
    : clients;
  const selectedClient = clientIdValue
    ? clients.find((client) => client.id === clientIdValue)
    : undefined;
  const selectedName = clientFullName(selectedClient);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.78fr)]">
      <Input
        id={id}
        value={nameValue}
        onChange={(event) => {
          const next = event.target.value;
          onNameChange(next);
          if (clientIdValue && selectedName && next.trim() !== selectedName) {
            onClearClient();
          }
        }}
        placeholder={placeholder}
      />
      <div className="flex min-w-0 gap-2">
        <ClientCombobox
          clients={selectableClients}
          value={clientIdValue}
          onChange={(clientId) => {
            const client = clients.find((item) => item.id === clientId);
            onClientSelect(clientId, clientFullName(client));
          }}
          placeholder="Link existing client"
          emptyText="No matching clients"
          className="min-w-0 flex-1"
        />
        {clientIdValue ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-400 hover:text-slate-700"
            onClick={onClearClient}
            aria-label="Clear linked client"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

