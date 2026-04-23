import { PageLayout } from '@/components/site/PageLayout';

export default function About() {
  return (
    <PageLayout>
      <article className="mx-auto max-w-2xl px-4 py-12 font-sans text-sm text-fg leading-relaxed">
        <h1 className="mb-4 font-mono text-lg font-bold tracking-caps text-hi">about</h1>
        <p>
          Observatory publishes charts derived from the EthPandaOps Xatu dataset, covering blob inclusion,
          mempool visibility, block propagation, and column propagation across the Ethereum consensus layer.
        </p>
      </article>
    </PageLayout>
  );
}
