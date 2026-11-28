import { handleStarterRequest } from '@/lib/aaa-starter-route';

export async function POST(request: Request) {
  return handleStarterRequest(request, false);
}
