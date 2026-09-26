import { notFound } from 'next/navigation';
import { DevPreviewScreen } from '@/components/dev/dev-preview-screen';

export default function DevPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <DevPreviewScreen />;
}

