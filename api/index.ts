import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    name: 'AI Team MVP',
    version: '1.0.0',
    description: 'AI development team that fixes bugs end-to-end',
    status: 'running',
    endpoints: {
      health: '/api/health',
      status: '/api/status'
    },
    timestamp: new Date().toISOString()
  });
}
