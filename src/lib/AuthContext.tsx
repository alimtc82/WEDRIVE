import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile, UserRole } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (args: { email: string; password: string; fullName: string; phone: string; role: UserRole }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(mapAuthError(error.message));
  };

  const signUp: AuthState["signUp"] = async ({ email, password, fullName, phone, role }) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, role } },
    });
    if (error) throw new Error(mapAuthError(error.message));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function mapAuthError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  if (msg.includes("User already registered")) return "هذا البريد مسجّل بالفعل";
  if (msg.includes("Password should be")) return "كلمة المرور قصيرة جدًا (6 أحرف على الأقل)";
  if (msg.includes("Email not confirmed")) return "لم يتم تأكيد البريد بعد";
  return msg;
}
