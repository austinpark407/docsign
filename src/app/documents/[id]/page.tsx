import { requireAdminPage } from '@/lib/auth-page';
import { config } from '@/lib/config';
import AppHeader from '@/components/AppHeader';
import DocumentView from './document-view';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  return (
    <>
      <AppHeader appName={config.appName} />
      <DocumentView id={id} />
    </>
  );
}
