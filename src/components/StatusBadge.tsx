import { DocumentStatus } from '@/lib/types';

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: 'Draft', sent: 'Sent', viewed: 'Opened', signed: 'Signed', voided: 'Voided',
};

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
