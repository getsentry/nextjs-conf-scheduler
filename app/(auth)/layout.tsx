export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      data-replay-private="auth"
      data-sentry-mask
    >
      {children}
    </div>
  );
}
