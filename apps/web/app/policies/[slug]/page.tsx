import { serverGet } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await serverGet<{ policy: { title: string; body: string; updatedAt: string } }>(`/policies/${slug}`);
  if (!data) return <div className="empty">That policy has not been published.</div>;
  return (
    <article className="panel">
      <h1 style={{ fontFamily: 'var(--serif)' }}>{data.policy.title}</h1>
      {data.policy.body.split('\n').map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
    </article>
  );
}
