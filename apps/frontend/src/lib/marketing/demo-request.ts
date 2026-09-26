export type DemoRequest = {
  name: string;
  phone: string;
  email: string;
  properties: string;
  units: string;
  challenge: string;
};

export type DemoRequestResult = { status: 'prepared'; reference: string };

export interface DemoRequestService {
  submit(input: DemoRequest): Promise<DemoRequestResult>;
}

class UnconfiguredDemoRequestService implements DemoRequestService {
  async submit(input: DemoRequest): Promise<DemoRequestResult> {
    const normalized = input.email.trim().toLowerCase();
    if (!input.name.trim() || !input.phone.trim() || !normalized || !input.challenge.trim()) {
      throw new Error('Complete the required contact and portfolio fields.');
    }
    return { status: 'prepared', reference: `DEMO-${Date.now().toString(36).toUpperCase()}` };
  }
}

export const demoRequestService: DemoRequestService = new UnconfiguredDemoRequestService();
