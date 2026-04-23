import { PageLayout } from '@/components/site/PageLayout';

export default function NotFound() {
  return (
    <PageLayout>
      <div className="mx-auto max-w-2xl px-4 py-24 text-center font-mono">
        <div className="text-lg font-bold tracking-caps text-hi">404</div>
        <p className="mt-2 text-sm text-muted">nothing at this path.</p>
      </div>
    </PageLayout>
  );
}
