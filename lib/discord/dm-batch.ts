import { sendDirectMessage, DmResult } from './dm';

export interface DmJob {
  discordUserId: string;
  content: string;
}

export interface DmJobResult extends DmJob {
  success: boolean;
  error?: string;
}

const MAX_CONCURRENT = 3;

// Discord has no bulk-DM endpoint (unlike email's MailerSend bulk API) — one
// HTTP call pair per recipient is unavoidable. A small worker pool keeps
// concurrency conservative against Discord's per-route and global bot rate
// limits rather than firing every DM at once.
export async function sendBulkDiscordDMs(jobs: DmJob[]): Promise<DmJobResult[]> {
  const results: DmJobResult[] = [];
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index++];
      const result: DmResult = await sendDirectMessage(job.discordUserId, job.content);
      results.push({ ...job, ...result });
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, jobs.length) }, worker));
  return results;
}
