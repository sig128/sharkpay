import { ButtonLink } from "@/components/ui/Button";
import { Wordmark } from "@/components/brand/Wordmark";

export default function NotFound() {
  return (
    <main id="main" className="noise flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Wordmark />
      <p className="eyebrow mt-12">404</p>
      <h1 className="display mt-3 text-[clamp(3rem,10vw,6rem)]">
        Wrong <span className="text-sunset">turn.</span>
      </h1>
      <p className="mt-4 max-w-md text-muted">That page doesn&apos;t exist, or it belongs to a different account.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Home</ButtonLink>
        <ButtonLink href="/app" variant="secondary">Open app</ButtonLink>
      </div>
    </main>
  );
}
