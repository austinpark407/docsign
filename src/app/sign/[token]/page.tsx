import type { Metadata } from 'next';
import SignView from './sign-view';

export const metadata: Metadata = { title: 'Review and sign', referrer: 'no-referrer' };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  return <SignView token={(await params).token} />;
}
