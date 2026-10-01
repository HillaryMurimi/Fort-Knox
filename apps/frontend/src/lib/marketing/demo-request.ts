import { api } from '@/lib/api';

export type DemoRequest = {
  name: string;
  phone: string;
  email: string;
  properties: string;
  units: string;
  challenge: string;
};

export type DemoRequestResult = {
  status: 'prepared' | 'submitted';
  reference: string;
  stage: string;
  nextAction: string;
  createdAt?: string;
};

export interface DemoRequestService {
  submit(input: DemoRequest, source?: string): Promise<DemoRequestResult>;
}

class ApiDemoRequestService implements DemoRequestService {
  async submit(input: DemoRequest, source = 'Website'): Promise<DemoRequestResult> {
    const normalized = input.email.trim().toLowerCase();
    const properties = Number(input.properties);
    if (!input.name.trim() || !input.phone.trim() || !normalized || !input.challenge.trim() || !Number.isInteger(properties) || properties < 1) {
      throw new Error('Complete the required contact and portfolio fields.');
    }
    if (typeof window === 'undefined') return { status: 'prepared', reference: `DEMO-${Date.now().toString(36).toUpperCase()}`, stage: 'Contact Established', nextAction: 'Schedule demo' };
    return api<DemoRequestResult>('/sales/demo-requests', {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({ ...input, email: normalized, properties, source, sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined }),
    });
  }
}

export const demoRequestService: DemoRequestService = new ApiDemoRequestService();
