import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { mapAuthError } from '@/lib/auth-errors';
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE, supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };
type SignUpResult = AuthResult & { needsEmailConfirmation: boolean };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, displayName: string, hasAcceptedTerms: boolean) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  deleteOwnAccount: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_NOT_CONFIGURED_MESSAGE };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? mapAuthError(error) : null };
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    hasAcceptedTerms: boolean,
  ): Promise<SignUpResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_NOT_CONFIGURED_MESSAGE, needsEmailConfirmation: false };
    }

    // Read by handle_new_user() (20260909100000_add_terms_acceptance.sql) to stamp
    // profiles.terms_accepted_at -- only ever 'true' here, register.tsx's own submit guard already
    // prevents calling signUp() at all before the checkbox is checked.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim(), terms_accepted: hasAcceptedTerms ? 'true' : 'false' } },
    });

    if (error) {
      return { error: mapAuthError(error), needsEmailConfirmation: false };
    }

    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    await supabase.auth.signOut();
  };

  // Calls delete_own_account() (20260908100000_add_self_service_account_deletion.sql), which only
  // ever operates on auth.uid() -- there is no id parameter to pass, by design, so this can never
  // target another account. auth.signOut() runs afterwards regardless of the RPC's own outcome:
  // once the row is gone server-side, the locally cached session must not linger either way.
  const deleteOwnAccount = async (): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_NOT_CONFIGURED_MESSAGE };
    }

    const { error } = await supabase.rpc('delete_own_account');
    await supabase.auth.signOut();

    return { error: error ? mapAuthError(error) : null };
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isAuthenticated: Boolean(session),
      signIn,
      signUp,
      signOut,
      deleteOwnAccount,
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
