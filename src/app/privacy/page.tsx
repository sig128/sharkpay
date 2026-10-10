import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Contact, LegalPage, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${brand.name} collects, why, who it's shared with and how to delete it.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          {brand.name} collects as little as it can to run your rewards account. We never ask for your Rockstar, Xbox,
          PlayStation or Steam password, never ask for a wallet seed phrase, and never sell your data.
        </p>
      }
    >
      <Section id="who" title="Who we are">
        <p>
          This policy covers the {brand.name} website and rewards dashboard (the &ldquo;Service&rdquo;). {brand.name} is
          an independent rewards platform. It is not affiliated with Rockstar Games, Take-Two Interactive, Apple, Google,
          X, Microsoft, Sony or Valve. Questions about this policy can be sent to <Contact />.
        </p>
      </Section>

      <Section id="collect" title="What we collect">
        <ul>
          <li>
            <strong>Sign-in details.</strong> When you sign in with Google, X, Microsoft or Steam, we receive your account
            ID with that provider, your display name and, where available, your profile picture. From X we also receive
            your username. We request read-only access and never post, follow or message on your behalf.
          </li>
          <li>
            <strong>Email sign-in.</strong> If you sign in with an email code, we store a one-way hash of your email
            address (so we can recognise you next time) and a masked version for display. We use your email only to send
            the sign-in code.
          </li>
          <li>
            <strong>Reward preferences.</strong> Your gaming platform (PC, PlayStation or Xbox), store region and
            preferred reward tier.
          </li>
          <li>
            <strong>Wallet address.</strong> If you link a Solana wallet, we store its public address and the signed
            message that proves you control it. Linking never gives us the ability to move your tokens.
          </li>
          <li>
            <strong>Rewards, orders and payments.</strong> Your SOL reward history, Shark Card orders, and for
            payments made with {brand.ticker} the amount, the paying wallet address and the transaction signature.
            Redemption codes are stored encrypted and are only shown to the account that owns them.
          </li>
          <li>
            <strong>Waitlist.</strong> If you join a waitlist, we store your email address encrypted.
          </li>
          <li>
            <strong>Security data.</strong> Session records (to keep you signed in), and your IP address for a short time
            to limit abuse of forms such as the waitlist.
          </li>
        </ul>
        <p>
          We do not receive or store card numbers or identity documents. If you buy {brand.ticker} through a payment
          partner such as MoonPay, that partner collects what it needs under its own privacy policy.
        </p>
      </Section>

      <Section id="use" title="How we use it">
        <ul>
          <li>To create your account, sign you in and keep it secure.</li>
          <li>To calculate SOL rewards, process Shark Card orders and deliver codes for your platform and region.</li>
          <li>To verify {brand.ticker} payments on the Solana blockchain and handle refunds.</li>
          <li>To prevent fraud, abuse and duplicate accounts, and to meet legal and accounting obligations.</li>
          <li>To send sign-in codes and, if you joined a waitlist, a message when that feature launches.</li>
        </ul>
        <p>
          We use your data because it is needed to provide the Service you asked for, because we have a legitimate
          interest in keeping it secure, or because the law requires it. We do not use it for advertising, profiling or
          training AI models.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          We use only essential cookies: one that keeps you signed in, and a short-lived one that protects the sign-in
          process. There are no advertising or analytics cookies and no third-party trackers.
        </p>
      </Section>

      <Section id="sharing" title="Who we share it with">
        <p>We share data only with services that help run {brand.name}, and only what each one needs:</p>
        <ul>
          <li><strong>Render</strong>: hosts the website and database (European Union region).</li>
          <li><strong>Google, X, Microsoft and Steam</strong>: when you choose to sign in with them.</li>
          <li><strong>Resend</strong>: sends sign-in code emails.</li>
          <li><strong>Solana network providers</strong>: we query public blockchain data, including wallet addresses, to verify holdings and payments.</li>
          <li><strong>Shark Card distributor</strong>: once connected, receives the order details needed to issue a code (product, platform and region), not your name or email.</li>
          <li><strong>Apple</strong>: if you add a balance pass to Apple Wallet, Apple delivers pass updates to your device.</li>
        </ul>
        <p>
          We may also disclose data when required by law or to protect the Service and its users. We never sell
          personal data.
        </p>
      </Section>

      <Section id="blockchain" title="Public blockchain data">
        <p>
          Solana wallet addresses and transactions are public and permanent. We cannot change or delete anything
          recorded on the blockchain, including payments you make in {brand.ticker}.
        </p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <ul>
          <li>Sign-in sessions expire after 14 days. Email sign-in codes expire within minutes.</li>
          <li>IP addresses used for abuse prevention are deleted within 24 hours.</li>
          <li>Account data is kept while your account is open.</li>
          <li>
            Order, payment and reward records may be kept after you close your account where needed for accounting,
            fraud prevention or legal obligations.
          </li>
        </ul>
      </Section>

      <Section id="rights" title="Your choices and rights">
        <p>
          You can update your platform and region and unlink sign-in methods or wallets in your account settings. You can
          ask us to access, correct, export or delete your personal data, or object to how we use it, by contacting{" "}
          <Contact />. We&apos;ll confirm the request comes from the account owner before acting on it. If you are in the
          EU or UK you can also complain to your local data protection authority.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          Redemption codes, waitlist emails and other sensitive fields are encrypted. Email addresses used for sign-in
          are stored only as hashes. Secrets stay on our servers, sensitive values are kept out of logs, and every order
          and code is checked against the account that owns it. No system is perfectly secure, but we design for
          failures to stay closed.
        </p>
      </Section>

      <Section id="age" title="Age">
        <p>The Service is for people aged 18 or older. We don&apos;t knowingly collect data from anyone younger.</p>
      </Section>

      <Section id="changes" title="Changes">
        <p>
          If we change this policy, we&apos;ll update the date above, and for significant changes we&apos;ll tell you in
          the app. See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
