import { PageShell } from '@/components/page-shell';
import { AccountPage } from '@/components/account-page';
import { currentUser } from '@/lib/current-user';
import { googleConfig } from '@/lib/auth';
import { recordingItems } from '@/lib/recording-view';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  const { error } = await searchParams;
  const recordings = user ? await recordingItems(user.id) : [];
  return (
    <PageShell maxWidth="760px">
      <AccountPage
        user={user ? { name: user.name, email: user.email } : null}
        signInConfigured={googleConfig() !== null}
        signInFailed={error === 'signin'}
        recordings={recordings}
      />
    </PageShell>
  );
}
