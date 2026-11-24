"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, registerSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Portal = "customer" | "staff" | "super_admin";
type Props = { mode: "login" | "register"; audience?: Portal };
type Values = { name?: string; email: string; password: string };

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill";
              width?: number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

export function AuthForm({ mode, audience = "customer" }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestNotice, setRequestNotice] = useState("");
  const [verificationPreview, setVerificationPreview] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleSdkReady, setGoogleSdkReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const allowGoogleAuth = audience !== "super_admin" && !mfaChallengeId;

  const schema = mode === "login" ? loginSchema : registerSchema;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
  });

  const redirectAfterSignIn = useCallback(
    async (user?: { permissions?: string[] }) => {
      await qc.invalidateQueries();
      toast.success("Signed in successfully");
      const next = params.get("next");
      const fallback =
        audience === "customer"
          ? "/products"
          : audience === "super_admin"
          ? "/super-admin/dashboard"
          : user?.permissions?.includes("analytics.read")
          ? "/admin"
          : user?.permissions?.includes("orders.read_all")
          ? "/admin/orders"
          : "/admin/products";
      const safeNext =
        next !== null &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        !next.includes("\\") &&
        (audience === "customer"
          ? !next.startsWith("/admin") && !next.startsWith("/super-admin")
          : audience === "staff"
          ? next.startsWith("/admin") && !next.startsWith("/admin/login")
          : next.startsWith("/super-admin/") || next.startsWith("/admin/"));
      router.replace(safeNext ? next : fallback);
      router.refresh();
    },
    [audience, params, qc, router]
  );

  const handleGoogleCredential = useCallback(
    async (credential?: string) => {
      if (!credential || audience === "super_admin") return;
      setRequestError("");
      setRequestNotice("");
      setVerificationPreview("");
      setGoogleSubmitting(true);
      try {
        const response = await fetch("/api/auth/google-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, portal: audience }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          setRequestError(
            body.message || "Google sign-in failed. Please make sure your Google account email is verified."
          );
          return;
        }
        await redirectAfterSignIn(body.data?.user);
      } catch {
        setRequestError("Unable to complete Google sign-in right now. Please try again.");
      } finally {
        setGoogleSubmitting(false);
      }
    },
    [audience, redirectAfterSignIn]
  );

  useEffect(() => {
    if (!allowGoogleAuth || !GOOGLE_CLIENT_ID) return;

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => {
          void handleGoogleCredential(res.credential);
        },
        ux_mode: "popup",
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: mode === "register" ? "signup_with" : "continue_with",
        shape: "pill",
        width: googleButtonRef.current.clientWidth || 360,
      });
      setGoogleSdkReady(true);
    };

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener("load", initializeGoogleButton);
      return () => existingScript.removeEventListener("load", initializeGoogleButton);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleButton;
    document.head.appendChild(script);
  }, [allowGoogleAuth, handleGoogleCredential, mode]);

  const onSubmit = async (values: Values) => {
    setRequestError("");
    setRequestNotice("");
    setVerificationPreview("");
    try {
      if (mfaChallengeId && !/^\d{6}$/.test(mfaCode)) {
        setRequestError("Enter the 6-digit verification code.");
        return;
      }
      const endpoint = mfaChallengeId
        ? "/api/auth/super-admin-verify"
        : mode === "login" && audience !== "customer"
        ? `/api/auth/${audience === "staff" ? "staff" : "super-admin"}-login`
        : `/api/auth/${mode}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mfaChallengeId
            ? { challengeId: mfaChallengeId, code: mfaCode }
            : { ...values, email: values.email.trim() }
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        const message = body.message || "Unable to sign in. Please check your credentials.";
        setRequestError(message);
        return;
      }

      if (body.data?.mfaRequired && typeof body.data.challengeId === "string") {
        setMfaChallengeId(body.data.challengeId);
        setRequestNotice("A 6-digit security code has been sent to your registered email. Enter it below to complete sign-in.");
        return;
      }

      if (mode === "register") {
        setRequestNotice("Your account has been created. Please verify your email to activate it.");
        const preview = body.data?.developmentEmailPreview as string | undefined;
        setVerificationPreview(preview?.match(/https?:\/\/\S+/)?.[0] || "");
        return;
      }

      await redirectAfterSignIn(body.data?.user);
    } catch {
      setRequestError("Unable to connect right now. Please check your network and try again.");
    }
  };

  const passwordProps = register("password");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {allowGoogleAuth && (
        <div className="space-y-3">
          {GOOGLE_CLIENT_ID ? (
            <div className="space-y-1.5">
              <div
                ref={googleButtonRef}
                className="flex min-h-[42px] w-full items-center justify-center"
              />
              {!googleSdkReady && (
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-center gap-2.5 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-semibold text-ink/70"
                >
                  <GoogleIcon />
                  Loading Google Sign-In...
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={googleSubmitting}
              onClick={() => {
                setRequestError(
                  "Google Sign-In requires NEXT_PUBLIC_GOOGLE_CLIENT_ID in Frontend/smartcart-web/.env.local and GOOGLE_CLIENT_ID in Backend/.env."
                );
              }}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-stone-50"
            >
              <GoogleIcon />
              {mode === "register"
                ? "Sign up with Google"
                : audience === "staff"
                ? "Continue with Google (Store Manager & Staff)"
                : "Continue with Google"}
            </button>
          )}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-ink/10" />
            <span className="mx-3 flex-shrink text-[11px] font-medium uppercase tracking-wider text-ink/45">
              or {mode === "register" ? "register with email" : "sign in with email"}
            </span>
            <div className="flex-grow border-t border-ink/10" />
          </div>
        </div>
      )}

      {!mfaChallengeId && mode === "register" && (
        <Field label="Full name" error={errors.name?.message} id="name">
          <input
            {...register("name")}
            id="name"
            autoComplete="name"
            className="field"
            placeholder="Enter your full name"
          />
        </Field>
      )}
      {!mfaChallengeId && (
        <Field
          label={
            mode === "login" && audience === "staff"
              ? "Staff email"
              : mode === "login" && audience === "super_admin"
              ? "Administrator email"
              : "Email address"
          }
          error={errors.email?.message}
          id="email"
        >
          <input
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="field"
            placeholder="name@gmail.com"
          />
        </Field>
      )}
      {!mfaChallengeId && (
        <Field label="Password" error={errors.password?.message} id="password">
          <span className="relative block">
            <input
              {...passwordProps}
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="field pr-12"
              placeholder={mode === "login" ? "Enter your password" : "Minimum 8 characters"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink/55 hover:bg-ink/5 hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </Field>
      )}
      {mfaChallengeId && (
        <Field label="Verification code" id="mfa-code">
          <input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="field"
            placeholder="6-digit code"
          />
        </Field>
      )}
      {mfaChallengeId && (
        <button
          type="button"
          className="text-xs text-ink/60 underline"
          onClick={() => {
            setMfaChallengeId("");
            setMfaCode("");
            setRequestNotice("");
            setRequestError("");
          }}
        >
          Back to sign in
        </button>
      )}
      {requestError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-800">
          {requestError}
        </p>
      )}
      {requestNotice && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          {requestNotice}
        </p>
      )}
      {verificationPreview && (
        <a
          className="block rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-center text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
          href={verificationPreview}
        >
          Click here to verify your email address →
        </a>
      )}
      <Button className="w-full" disabled={isSubmitting || googleSubmitting}>
        {isSubmitting
          ? mfaChallengeId
            ? "Verifying..."
            : mode === "login"
            ? "Signing in..."
            : "Creating account..."
          : mfaChallengeId
          ? "Verify & Sign In"
          : mode === "login"
          ? "Sign In"
          : "Create Account"}
      </Button>
      {!mfaChallengeId &&
        (mode === "login" && audience !== "customer" ? null : (
          <p className="text-center text-xs text-ink/60 pt-1">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <Link
              className="font-semibold text-emerald-700 hover:underline"
              href={mode === "login" ? "/register" : "/login"}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        ))}
      {!mfaChallengeId && mode === "login" && (
        <div className="flex justify-center gap-5 pt-1 text-xs text-ink/55">
          <Link className="hover:text-ink underline underline-offset-4" href="/forgot-password">
            Forgot password?
          </Link>
          {audience === "customer" && (
            <Link className="hover:text-ink underline underline-offset-4" href="/resend-verification">
              Verify email
            </Link>
          )}
        </div>
      )}
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1l-3.3 2.5C4.8 19.7 8.1 22 12 22z"
      />
      <path
        fill="#4A90E2"
        d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.1 7.6C2.4 9 2 10.4 2 12s.4 3 1.1 4.4l3.3-2.5z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.1 2 4.8 4.3 3.1 7.6l3.3 2.5c.8-2.3 3-4.2 5.6-4.2z"
      />
    </svg>
  );
}

function Field({
  label,
  error,
  id,
  children,
}: {
  label: string;
  error?: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block text-xs font-semibold text-ink/80">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-normal text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
