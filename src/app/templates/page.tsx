import { requireAdminPage } from '@/lib/auth-page';
import { config } from '@/lib/config';
import AppHeader from '@/components/AppHeader';
import TemplateList from './template-list';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  await requireAdminPage();
  return (
    <>
      <AppHeader appName={config.appName} />
      <TemplateList />
    </>
  );
}
