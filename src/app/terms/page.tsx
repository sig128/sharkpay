import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Contact, LegalPage, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for using ${brand.name}, SOL rewards, ${brand.ticker} payments and Shark Card redemptions.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply when you use the {brand.name} website and rewards dashboard (the &ldquo;Service&rdquo;). By
          creating an account or using the Service, you agree to them. If you don&apos;t agree, please don&apos;t use
          the Service.
        </p>
      }
    >
      <Section id="eligibility" title="Who can use it">
        <p>
          You must be at least 18 years old and allowed to use crypto-asset services where you live. You may not use the
          Service if you are subject to sanctions or located somewhere the Service, {brand.ticker} or Shark Card codes
          are prohibited. One account per person.
        </p>
      </Section>

      <Section id="independent" title="Independent platform">
        <p>
          {brand.legal.independence} {brand.name} is not an official Rockstar, GTA, Apple, Google, Visa or Mastercard
          product. {brand.legal.trademarks}
        </p>
      </Section>

      <Section id="rewards" title="Rewards">
        <ul>
          <li>
            Rewards come from a pool funded by fees that have actually been collected and settled. Eligible holders
            receive a share of that pool in SOL. The pool, and your share, change every period and can be zero.
          </li>
          <li>
            <strong>There is no guaranteed return, yield or profit.</strong> Nothing on the Service is investment,
            financial, legal or tax advice.
          </li>
          <li>{brand.legal.rewards}</li>
          <li>
            Balances, prices and reward calculations are determined by our servers, not by what a browser or wallet
            displays. The website never sends SOL; the operator pays rewards from the payout wallet and records each
            transfer.
          </li>
        </ul>
      </Section>

      <Section id="token" title={`The ${brand.ticker} token`}>
        <ul>
          <li>
            We don&apos;t sell {brand.ticker} directly. You can buy it through third parties such as MoonPay, Jupiter or
            Raydium, under their own terms and checks.
          </li>
          <li>
            Crypto-assets are volatile and risky. {brand.ticker} can lose some or all of its value, and its token
            transfer fee applies to transfers. We make no promise that its price will rise.
          </li>
          <li>
            Always check you&apos;re using the official contract address shown on our website. We can&apos;t recover
            tokens sent to the wrong address or lost because of fake tokens.
          </li>
        </ul>
      </Section>

      <Section id="shark-cards" title="Shark Card redemptions">
        <ul>
          <li>
            Shark Card codes are supplied by an authorised distributor. A code works only on the platform and in the
            store region it was issued for. Check both before you redeem.
          </li>
          <li>
            Once a code has been issued and revealed to you, the redemption is final unless the code turns out to be
            invalid.
          </li>
          <li>
            Use of GTA$ inside the game is governed by Rockstar Games&apos; own terms. We can&apos;t help with in-game
            balances or game accounts.
          </li>
          <li>Existing Shark Cards and codes are not available for, and are not claimed to work in, GTA VI.</li>
          <li>
            Products, prices and availability can change. If delivery fails, the {brand.ticker} payment for that order is
            marked for refund as described below.
          </li>
        </ul>
      </Section>

      <Section id="pay-with-shark" title={`Paying with ${brand.ticker}`}>
        <ul>
          <li>
            When you choose to pay with {brand.ticker}, we show the exact amount and a payment window. The amount includes
            the token transfer fee so the full price arrives.
          </li>
          <li>
            Send exactly the amount shown, from a wallet you control, before the window closes. A blockchain payment
            can&apos;t be reversed by us.
          </li>
          <li>
            If a payment arrives short, late or can&apos;t be fulfilled, the order is not delivered and the tokens we
            received are marked for refund to the wallet that sent them.
          </li>
        </ul>
      </Section>

      <Section id="planned" title="Planned features">
        <p>
          Apple Pay, Google Pay, Visa and Mastercard payments, and a {brand.name} payment card, are planned and shown as
          &ldquo;coming soon&rdquo;. They are not available today, and there is no card issuer or payment partner for
          them yet. Joining a waitlist doesn&apos;t guarantee access. The Apple Wallet pass shows your {brand.ticker}{" "}
          holdings only. It is not a payment card and can&apos;t be used to spend.
        </p>
      </Section>

      <Section id="account" title="Your account">
        <ul>
          <li>
            You sign in through Google, X, Microsoft, Steam or an email code. We never ask for your game-account
            passwords or your wallet seed phrase. Anyone who does is not us.
          </li>
          <li>Keep your sign-in methods and recovery codes safe. You&apos;re responsible for activity on your account.</li>
          <li>Linking a wallet only proves you control it. It never lets us move your tokens.</li>
        </ul>
      </Section>

      <Section id="conduct" title="What you can't do">
        <ul>
          <li>Create multiple accounts, use bots, or manipulate holdings or rewards.</li>
          <li>Resell or trade codes in breach of the publisher&apos;s terms, or use the Service for fraud or money laundering.</li>
          <li>Attempt to access other people&apos;s accounts, codes or data, or interfere with the Service.</li>
        </ul>
        <p>We may suspend or close accounts that break these terms, and withhold rewards obtained by breaking them.</p>
      </Section>

      <Section id="third-parties" title="Third-party services">
        <p>
          Sign-in providers, wallets, exchanges, payment partners, the Solana network and game publishers are run by
          others. Their terms apply to your use of them, and we aren&apos;t responsible for their availability or
          actions.
        </p>
      </Section>

      <Section id="liability" title="Disclaimers and liability">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we
          don&apos;t guarantee it will be uninterrupted or error-free, and we aren&apos;t liable for indirect losses, lost
          profits, token price changes, or losses caused by blockchain networks, wallets or third parties. Nothing in
          these terms limits rights you have under consumer law that can&apos;t be excluded.
        </p>
      </Section>

      <Section id="changes" title="Changes and ending">
        <p>
          We may update these terms. We&apos;ll change the date above, and tell you in the app about significant changes.
          You can stop using the Service at any time and ask us to close your account. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle your data.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Questions about these terms: <Contact />.
        </p>
      </Section>
    </LegalPage>
  );
}
