import "server-only";

import { emailDefaults, serverEnv } from "@/lib/env.server";

type SmtpInput = {
  user?: string;
  fromEmail?: string;
};

export type SmtpAccount = {
  user: string;
  password: string;
};

const CLAIRE_EMAIL = "claireq6886@gmail.com";

export function resolveSmtpAccount(input: SmtpInput = {}): SmtpAccount {
  const requestedEmail = (input.fromEmail || input.user || "").trim().toLowerCase();

  if (requestedEmail === CLAIRE_EMAIL) {
    return {
      user: CLAIRE_EMAIL,
      password: serverEnv.getClaireSmtpPassword(),
    };
  }

  return {
    user: input.user || emailDefaults.user,
    password: serverEnv.getSmtpPassword(),
  };
}
