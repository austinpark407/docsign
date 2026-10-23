import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Signed', referrer: 'no-referrer' };

export default async function DonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl">✓</div>
        <h1 className="text-xl font-semibold mb-2">You&apos;re all set</h1>
        <p className="hint mb-6">Your signature was recorded. If email is set up, a copy is on its way to your inbox.</p>
        <a className="btn btn-primary" href={`/api/sign/${token}/download`}>Download your signed copy</a>
      </div>
    </main>
  );
}
