import { PageLayout } from '@/components/site/PageLayout';

export default function Home() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-mono text-lg font-bold tracking-caps text-hi">observatory</h1>
        <p className="mt-4 font-sans text-sm text-fg leading-relaxed">
          Ethereum p2p telemetry. Charts, dates, layouts.
        </p>
      </div>
    </PageLayout>
  );
}
