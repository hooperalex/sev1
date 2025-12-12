import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    service: 'ai-team-mvp',
    environment: process.env.VERCEL_ENV || 'development',
    region: process.env.VERCEL_REGION || 'unknown',
    deployment: {
      id: process.env.VERCEL_DEPLOYMENT_ID || 'local',
      url: process.env.VERCEL_URL || 'localhost'
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    timestamp: new Date().toISOString()
  });
}
