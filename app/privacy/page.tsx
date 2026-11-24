import { PageShell } from '@/components/page-shell';
import { PrivacyPage } from '@/components/privacy-page';

export default function Page() {
  return (
    <PageShell maxWidth="760px">
      <PrivacyPage />
    </PageShell>
  );
}
