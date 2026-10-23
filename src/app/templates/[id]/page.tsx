import { requireAdminPage } from '@/lib/auth-page';
import { config } from '@/lib/config';
import AppHeader from '@/components/AppHeader';
import TemplateEditor from './editor';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  return (
    <>
      <AppHeader appName={config.appName} />
      <TemplateEditor id={id} />
    </>
  );
}
