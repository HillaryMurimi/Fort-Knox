import { api } from '../api';
import type { DocumentRecord, EvidenceRecord } from './resource-types';

export interface CreateDocumentInput {
  propertyId?: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  ownerUserId?: string;
  title: string;
  description?: string;
  category: DocumentRecord['category'];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider?: DocumentRecord['storageProvider'];
  storageKey: string;
  sha256: string;
  visibility?: DocumentRecord['visibility'];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateDocumentInput = Partial<
  Pick<CreateDocumentInput, 'title' | 'description' | 'visibility' | 'tags' | 'metadata'>
> & { status?: DocumentRecord['status'] };

export type EvidenceQuery = {
  relatedResourceType?: string;
  relatedResourceId?: string;
  unitId?: string;
};

export interface SignedUrlResponse {
  url: string;
  expiresAt?: string;
  expiresInSeconds?: number;
}

export interface CreateEvidenceInput {
  propertyId?: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  ownerUserId?: string;
  documentId?: string;
  evidenceType: EvidenceRecord['evidenceType'];
  source: EvidenceRecord['source'];
  capturedAt: string;
  title?: string;
  description?: string;
  storageKey?: string;
  sha256?: string;
  mimeType?: string;
  sizeBytes?: number;
  relatedResourceType: EvidenceRecord['relatedResourceType'];
  relatedResourceId: string;
  metadata?: Record<string, unknown>;
  createdAtClient?: string;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const result = search.toString();
  return result ? `?${result}` : '';
}

export const documentClient = {
  list: (organizationId: string) =>
    api<DocumentRecord[]>(`/organizations/${organizationId}/documents`),
  get: (documentId: string) =>
    api<DocumentRecord>(`/documents/${documentId}`),
  create: (organizationId: string, input: CreateDocumentInput) =>
    api<DocumentRecord>(`/organizations/${organizationId}/documents`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (documentId: string, input: UpdateDocumentInput) =>
    api<DocumentRecord>(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

export const storageClient = {
  signedUrl: (
    organizationId: string,
    key: string,
    provider: 'CLOUDINARY' | 'S3' | 'OTHER' = 'S3',
    expiresInSeconds = 900,
  ) =>
    api<SignedUrlResponse>(`/integrations/organizations/${organizationId}/storage/signed-url`, {
      method: 'POST',
      body: JSON.stringify({ key, provider, expiresInSeconds }),
    }),
};

export const evidenceClient = {
  list: (organizationId: string, params: EvidenceQuery = {}) =>
    api<EvidenceRecord[]>(
      `/organizations/${organizationId}/evidence${query(params)}`,
    ),
  create: (organizationId: string, input: CreateEvidenceInput) =>
    api<EvidenceRecord>(`/organizations/${organizationId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};