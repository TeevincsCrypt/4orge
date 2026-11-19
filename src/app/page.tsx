import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  FileCode2,
  FlaskConical,
  FolderGit2,
  Hammer,
  KeyRound,
  Lock,
  PenLine,
  Rocket,
  ScanSearch,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/shell";

export const metadata = {
  title: "4ORGE — Smart contract deployment workspace for QIE",
  description:
    "Compile, test and deploy Solidity contracts to QIE Blockchain with reusable Runbooks, wallet-signed transactions and on-chain receipt validation.",
};

const FEATURES = [
  { icon: FolderGit2, pastel: "bg-pastel-pink", title: "Bring any project", body: "Start from a template, upload a Hardhat or Foundry folder, or import a GitHub repository. Config files are read, never executed." },
  { icon: Hammer, pastel: "bg-pastel-lilac", title: "Real compilation", body: "Official Solidity compilers, verified by checksum. OpenZeppelin and other npm imports resolve without running install scripts." },
  { icon: FlaskConical, pastel: "bg-pastel-blue", title: "Sandboxed tests", body: "Hardhat 3 runs your Solidity and TypeScript suites in an isolated sandbox, with every test, failure and duration reported." },
  { icon: Workflow, pastel: "bg-pastel-mint", title: "Reusable Runbooks", body: "Validate → compile → test → review → sign → confirm → verify. Save it once, run it again with one click, export it as YAML." },
  { icon: PenLine, pastel: "bg-pastel-lilac", title: "Your wallet signs", body: "MetaMask or Rabby approves every deployment after a full summary: contract, network, deployer, arguments and gas." },
  { icon: ScanSearch, pastel: "bg-pastel-pink", title: "Verified on-chain", body: "A transaction hash is never taken on trust. 4ORGE reads the receipt from QIE and checks sender, bytecode, status and code." },
];

const STEPS = [
  { id: "load", title: "Load & validate project", cat: "Automated", tone: "bg-panel-3 text-muted" },
  { id: "network", title: "Check QIE chain ID", cat: "Automated", tone: "bg-panel-3 text-muted" },
  { id: "compile", title: "Compile with solc", cat: "Local build", tone: "bg-accent-soft text-accent-strong" },
  { id: "test", title: "Run Hardhat tests", cat: "Local build", tone: "bg-accent-soft text-accent-strong" },
  { id: "prepare", title: "Type-check args, estimate gas", cat: "Automated", tone: "bg-panel-3 text-muted" },
  { id: "confirm", title: "Your review", cat: "Human", tone: "bg-[#fdf1dc] text-[#8a5a12]" },
  { id: "sign", title: "Wallet signs & broadcasts", cat: "Wallet", tone: "bg-[#fbe4ec] text-[#a92f53]" },
  { id: "receipt", title: "Receipt validated on-chain", cat: "Automated", tone: "bg-panel-3 text-muted" },
];

const YAML = `schema: 4orge.runbook/v1
name: Deploy QieToken to Testnet
network: qie-testnet
target:
  contract: QieToken
  constructorArgs: ["0xYourOwner…", "1e24"]
steps:
  - { id: load,    uses: project.load }
  - { id: network, uses: network.check }
  - { id: compile, uses: contracts.compile }
  - { id: test,    uses: contracts.test, with: { required: true } }
  - { id: args,    uses: deploy.validate-args }
  - { id: prepare, uses: deploy.prepare }
  - { id: confirm, uses: human.confirm }
  - { id: sign,    uses: wallet.deploy }
  - { id: receipt, uses: tx.confirm }
  - { id: record,  uses: deployment.record }
  - { id: verify,  uses: contract.verify }`;

const GUARANTEES = [
  { icon: KeyRound, title: "No keys, ever", body: "4ORGE never asks for, stores or sees a seed phrase or private key." },
  { icon: Lock, title: "No code in Runbooks", body: "Only 13 allowlisted step types. There is no shell or script step to abuse." },
  { icon: ShieldCheck, title: "Imports are untrusted", body: "Paths are validated, configs are read as text, and builds run in limited processes." },
  { icon: BadgeCheck, title: "Receipts, not promises", body: "Success is recorded only after the chain itself confirms the deployment." },
  { icon: Rocket, title: "Mainnet locked by default", body: "Testnet first. Mainnet needs a deliberate switch by the owner." },
  { icon: FileCode2, title: "Private by design", body: "With Supabase, every table is protected by Row Level Security." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-text">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line-strong/40 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-8 px-4 sm:px-8">
          <Link href="/" aria-label="4ORGE home"><Logo /></Link>
          <nav className="hidden items-center gap-1 text-[14px] text-muted md:flex">
            <a href="#product" className="rounded-full px-3 py-2 hover:bg-panel hover:text-text">Product</a>
            <a href="#runbooks" className="rounded-full px-3 py-2 hover:bg-panel hover:text-text">Runbooks</a>
            <a href="#security" className="rounded-full px-3 py-2 hover:bg-panel hover:text-text">Security</a>
            <Link href="/docs" className="rounded-full px-3 py-2 hover:bg-panel hover:text-text">Docs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/docs/getting-started" className="hidden h-10 items-center rounded-full px-4 text-[14px] text-text hover:bg-panel sm:inline-flex">Get started</Link>
            <Link href="/dashboard" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-[#2a2a35]">
              Open workspace <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[720px] bg-[radial-gradient(ellipse_60%_50%_at_20%_10%,#fbe4ec_0%,transparent_60%),radial-gradient(ellipse_55%_50%_at_80%_0%,#dde9fb_0%,transparent_60%)]" />
        <div className="relative mx-auto max-w-[1200px] px-4 pt-16 pb-10 text-center sm:px-8 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-panel px-3.5 py-1.5 text-[13px] text-muted shadow-card">
            <span className="size-1.5 rounded-full bg-accent" />
            Developer infrastructure for QIE Blockchain
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-[40px] leading-[1.05] font-medium tracking-[-0.03em] text-text sm:text-[64px]">
            Compile, test and deploy to QIE <span className="text-brand">from one workspace.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted">
            4ORGE replaces the pile of scripts, terminals and spreadsheets between your Solidity code and a verified deployment.
            You review and your wallet signs. Every receipt is checked on-chain.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-[#2a2a35]">
              <Rocket className="size-4" /> Open workspace
            </Link>
            <Link href="/docs/getting-started" className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-panel px-6 text-[15px] font-medium text-text hover:bg-panel-2">
              <BookOpen className="size-4" /> Read the guide
            </Link>
          </div>
          <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-muted">
            {["QIE Testnet (chain 1983) checked live", "Keys never leave your wallet", "Open source · MIT"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-ok" />{t}</li>
            ))}
          </ul>
        </div>

        {/* Product shot */}
        <div className="relative mx-auto max-w-[1200px] px-4 pb-20 sm:px-8">
          <div className="relative rounded-[28px] border border-white bg-panel/60 p-2 shadow-[0_40px_80px_-40px_rgba(40,40,90,0.35)] sm:p-3">
            <Image
              src="/landing/dashboard.png"
              alt="The 4ORGE dashboard showing deployment statistics, weekly activity, projects and Runbook runs"
              width={2560}
              height={1640}
              priority
              className="h-auto w-full rounded-[20px]"
            />
          </div>
          <div className="absolute -bottom-2 left-8 hidden w-72 rounded-2xl bg-panel p-4 shadow-pop md:block lg:left-0">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text"><ShieldCheck className="size-4 text-ok" /> Receipt validated on-chain</div>
            <ul className="mt-2.5 space-y-1.5 text-xs text-muted">
              {["Contract creation transaction", "Sender is the approved deployer", "Creation code matches the build", "Receipt status is success"].map((c) => (
                <li key={c} className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-ok" />{c}</li>
              ))}
            </ul>
          </div>
          <div className="absolute right-8 -bottom-2 hidden items-center gap-3 rounded-2xl bg-pastel-pink px-4 py-3 shadow-pop md:flex lg:right-0">
            <span className="flex size-10 items-center justify-center rounded-full bg-panel"><PenLine className="size-[18px]" /></span>
            <span>
              <span className="block text-xs text-muted">Wallet approval</span>
              <span className="block text-[15px] font-medium text-text">You sign. Always.</span>
            </span>
          </div>
        </div>
      </section>

      {/* Stack strip */}
      <section className="border-y border-line-strong/40 bg-sidebar">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-[14px] text-muted sm:px-8">
          <span className="text-faint">Built on</span>
          {["Solidity", "Hardhat 3", "viem", "MetaMask", "Rabby", "Supabase", "GitHub"].map((s) => (
            <span key={s} className="font-medium text-text/70">{s}</span>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto grid max-w-[1200px] gap-12 px-4 py-24 sm:px-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[13px] font-medium tracking-wide text-accent uppercase">The problem</p>
          <h2 className="mt-3 text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">Ten tools between your code and a deployment.</h2>
          <p className="mt-5 text-[16px] leading-relaxed text-muted">
            Compiler versions, dependency installs, test runners, RPC URLs, deploy scripts, wallet setup, explorers, and a spreadsheet of addresses. Every step is manual, easy to get wrong, and has to be repeated whenever a contract changes.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-panel p-6 shadow-card">
            <div className="text-[13px] font-medium text-faint">Before</div>
            <ul className="mt-4 space-y-3 text-[14px] text-muted">
              {["Hunt for the right solc version", "Copy RPC URLs from forum posts", "Hope the deploy script used the right network", "Trust a transaction hash in a terminal", "Paste addresses into a spreadsheet"].map((t) => (
                <li key={t} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-rose/60" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-pastel-lilac p-6">
            <div className="text-[13px] font-medium text-accent-strong">With 4ORGE</div>
            <ul className="mt-4 space-y-3 text-[14px] text-text">
              {["Compiler chosen from your pragmas, checksum-verified", "Chain ID verified live before anything is sent", "One Runbook you can review, rerun and export", "Receipt validated against the chain", "Permanent, searchable deployment history"].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="product" className="scroll-mt-20 bg-sidebar py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[13px] font-medium tracking-wide text-accent uppercase">Product</p>
            <h2 className="mt-3 text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">Everything from first commit to verified contract.</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, pastel, title, body }) => (
              <div key={title} className="rounded-2xl bg-panel p-6 shadow-card">
                <span className={`flex size-12 items-center justify-center rounded-full ${pastel}`}><Icon className="size-5 text-text" /></span>
                <h3 className="mt-5 text-[17px] font-medium tracking-tight">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Runbooks */}
      <section id="runbooks" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-24 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start [&>*]:min-w-0">
          <div>
            <p className="text-[13px] font-medium tracking-wide text-accent uppercase">Runbooks</p>
            <h2 className="mt-3 text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">Your deployment process, written down once.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              A Runbook is a versioned, declarative workflow. Every step comes from an allowlist and is tagged by what it is allowed to do. 4ORGE runs the automated steps for you and stops for the two things only you can do: review and sign.
            </p>
            <ol className="mt-8 space-y-2">
              {STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl bg-panel px-4 py-3 shadow-card">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-panel-3 text-xs font-medium text-muted">{i + 1}</span>
                  <span className="flex-1 text-[14px] text-text">{s.title}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.cat}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="lg:sticky lg:top-28">
            <div className="overflow-hidden rounded-2xl bg-panel shadow-pop">
              <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
                <span className="size-2.5 rounded-full bg-[#f3c4d2]" />
                <span className="size-2.5 rounded-full bg-[#f6e2b8]" />
                <span className="size-2.5 rounded-full bg-[#c9e9d8]" />
                <span className="mono ml-3 text-xs text-muted">deploy-qietoken.runbook.yaml</span>
              </div>
              <pre className="mono overflow-x-auto bg-panel-2/60 p-5 text-[12.5px] leading-[1.75] text-[#33334a]">{YAML}</pre>
            </div>
            <p className="mt-4 text-[13px] text-muted">
              Unknown keys and step types are rejected. A wallet step must always be followed by on-chain confirmation and recording.{" "}
              <Link href="/docs/runbooks" className="font-medium text-accent">Runbook reference →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* Execution shot */}
      <section className="bg-sidebar py-24">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:items-center [&>*]:min-w-0">
          <div>
            <p className="text-[13px] font-medium tracking-wide text-accent uppercase">Every step accounted for</p>
            <h2 className="mt-3 text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">Watch it run. Keep the receipt.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              Each execution streams its steps and logs live, shows exactly what your wallet will sign, and ends with a downloadable report: contract, network, deployer, transaction, address and constructor arguments.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-pastel-pink px-5 py-4"><div className="text-[13px] text-muted">Allowlisted steps</div><div className="text-[26px] font-medium">13</div></div>
              <div className="rounded-2xl bg-pastel-blue px-5 py-4"><div className="text-[13px] text-muted">Private keys stored</div><div className="text-[26px] font-medium">0</div></div>
            </div>
          </div>
          <div className="rounded-[24px] border border-white bg-panel/60 p-2 shadow-[0_40px_80px_-40px_rgba(40,40,90,0.35)]">
            <Image src="/landing/execution.png" alt="A completed deployment Runbook execution with on-chain checks and the execution log" width={2560} height={1640} className="h-auto w-full rounded-[18px]" />
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-24 sm:px-8">
        <div className="rounded-[28px] bg-ink px-6 py-14 text-white sm:px-12">
          <div className="max-w-2xl">
            <p className="text-[13px] font-medium tracking-wide text-[#9cc3f4] uppercase">Security</p>
            <h2 className="mt-3 text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">Built to be trusted with real deployments.</h2>
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {GUARANTEES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="flex size-10 items-center justify-center rounded-full bg-white/10"><Icon className="size-[18px] text-[#cfe1fb]" /></span>
                <h3 className="mt-4 text-[16px] font-medium">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-white/65">{body}</p>
              </div>
            ))}
          </div>
          <Link href="/docs/architecture" className="mt-12 inline-flex items-center gap-2 text-[14px] font-medium text-[#cfe1fb] hover:text-white">
            Read the security model <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-8">
        <h2 className="text-[34px] leading-tight font-medium tracking-[-0.02em] sm:text-[42px]">From zero to Testnet in four steps.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {[
            ["Create a project", "Template, folder upload or GitHub import."],
            ["Compile & test", "Real solc, real Hardhat, real results."],
            ["Start a deployment", "Pick the contract, enter arguments, keep Testnet."],
            ["Review & sign", "Approve in your wallet. 4ORGE confirms on-chain."],
          ].map(([t, b], i) => (
            <div key={t} className="rounded-2xl bg-panel p-6 shadow-card">
              <span className="text-[13px] font-medium text-accent">0{i + 1}</span>
              <h3 className="mt-3 text-[17px] font-medium">{t}</h3>
              <p className="mt-1.5 text-[14px] text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-8">
        <div className="flex flex-col items-start gap-6 rounded-[28px] bg-pastel-lilac px-6 py-12 sm:px-12 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-6">
            <span className="hidden size-20 shrink-0 items-center justify-center rounded-3xl bg-panel shadow-card sm:flex"><LogoMark className="h-12 w-[53px]" /></span>
            <div>
            <h2 className="text-[28px] leading-tight font-medium tracking-[-0.02em] sm:text-[34px]">Ship your next contract with confidence.</h2>
            <p className="mt-2 text-[15px] text-muted">Runs locally with one command. No account needed to try it.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-[#2a2a35]">
              Open workspace <ArrowRight className="size-4" />
            </Link>
            <Link href="/docs/api" className="inline-flex h-12 items-center rounded-full border border-line-strong bg-panel px-6 text-[15px] font-medium hover:bg-panel-2">API reference</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-strong/50">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:px-8">
          <Logo />
          <span className="sm:ml-4">Built for QIE Blockchain Hackathon 3.0 · MIT licensed</span>
          <nav className="flex gap-5 sm:ml-auto">
            <Link href="/docs" className="hover:text-text">Docs</Link>
            <Link href="/docs/qie-networks" className="hover:text-text">QIE networks</Link>
            <Link href="/docs/architecture" className="hover:text-text">Security</Link>
            <a href="https://github.com/TeevincsCrypt/4orge" className="hover:text-text">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
