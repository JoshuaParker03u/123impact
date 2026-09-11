import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { InteractionType, InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { verifyDiscordRequest } from '@/lib/discord/verify';
import { editOriginalResponse } from '@/lib/discord/api';
import { encodeCustomId, decodeCustomId } from '@/lib/discord/custom-id';
import { sendDirectMessage } from '@/lib/discord/dm';
import {
  getConnectionByGuildId,
  getUpcomingEventsForOrg,
  getOpenShiftsForEvent,
  getEventById,
} from '@/lib/discord/queries';

export const runtime = 'nodejs';

function ephemeral(content: string, components: unknown[] = []) {
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL, components },
  });
}

function updateMessage(content: string, components: unknown[]) {
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { content, components },
  });
}

function selectMenuRow(customId: string, placeholder: string, options: { label: string; value: string; description?: string }[]) {
  return [{ type: 1, components: [{ type: 3, custom_id: customId, placeholder, options }] }];
}

function signupModal(customId: string) {
  return NextResponse.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: customId,
      title: 'Sign Up',
      components: [
        { type: 1, components: [{ type: 4, custom_id: 'name', label: 'Your name', style: 1, required: true }] },
        { type: 1, components: [{ type: 4, custom_id: 'email', label: 'Your email', style: 1, required: true }] },
      ],
    },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature-Ed25519');
  const timestamp = req.headers.get('X-Signature-Timestamp');

  if (!(await verifyDiscordRequest(rawBody, signature, timestamp))) {
    return new NextResponse('Bad request signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (interaction.data?.name !== 'signup') {
      return ephemeral('Unknown command.');
    }

    const connection = await getConnectionByGuildId(interaction.guild_id);
    if (!connection) {
      return ephemeral('This server is not connected to a 123impact organization. Ask an admin to reconnect it.');
    }

    if (connection.channel_id && connection.channel_id !== interaction.channel_id) {
      const channelName = interaction.channel?.name;
      return ephemeral(channelName ? `Please use /signup in #${channelName} instead.` : 'This command isn\'t available in this channel.');
    }

    const events = await getUpcomingEventsForOrg(connection.organization_id, interaction.member?.user?.id ?? interaction.user?.id ?? null);
    if (events.length === 0) {
      return ephemeral('There are no upcoming events to sign up for right now.');
    }

    const options = events.map((e) => ({
      label: e.title.slice(0, 100),
      value: e.id,
      description: e.date,
    }));

    return ephemeral('Choose an event:', selectMenuRow('select_event', 'Choose an event', options));
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id;
    const selectedValue = interaction.data?.values?.[0];

    if (customId === 'select_event') {
      const eventId = selectedValue;
      const { shifts, hasAnyShifts } = await getOpenShiftsForEvent(eventId, interaction.member?.user?.id ?? interaction.user?.id ?? null);

      if (shifts.length > 0) {
        const options = shifts.map((s) => ({
          label: `${s.name} (${s.start_time}-${s.end_time})`.slice(0, 100),
          value: s.id,
          description: s.is_full ? 'Waitlist' : `${s.available} spot${s.available === 1 ? '' : 's'} open`,
        }));
        return updateMessage('Choose a shift:', selectMenuRow('select_shift', 'Choose a shift', options));
      }

      if (hasAnyShifts) {
        return updateMessage('No shifts are available to you for this event right now — you may have already signed up for all of them.', []);
      }

      const event = await getEventById(eventId);
      if (!event) return ephemeral('That event could not be found.');
      if (!event.attendee_enabled && !event.is_shiftless) {
        return updateMessage('This event isn\'t currently open for signups.', []);
      }
      const attendeeType = event.attendee_enabled ? 'attendee' : 'volunteer';
      return signupModal(encodeCustomId('signup_modal_rsvp', `${eventId}:${attendeeType}`));
    }

    if (customId === 'select_shift') {
      const shiftId = selectedValue;
      return signupModal(encodeCustomId('signup_modal_shift', shiftId));
    }

    return ephemeral('Something went wrong — please run /signup again.');
  }

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const decoded = decodeCustomId(interaction.data?.custom_id ?? '');
    if (!decoded) return ephemeral('Something went wrong — please run /signup again.');

    const rows: { components: { custom_id: string; value: string }[] }[] = interaction.data.components ?? [];
    const fields = rows.flatMap((row) => row.components);
    const name = fields.find((f) => f.custom_id === 'name')?.value?.trim();
    const email = fields.find((f) => f.custom_id === 'email')?.value?.trim();
    const interactionToken = interaction.token;
    const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? null;

    after(async () => {
      try {
        const result = decoded.kind === 'signup_modal_shift'
          ? await submitShiftSignup(decoded.id, name!, email!, discordUserId)
          : await submitRsvpSignup(decoded.id, name!, email!, discordUserId);
        await editOriginalResponse(interactionToken, { content: result, components: [] });
      } catch (e) {
        console.error('Discord signup follow-up error:', e);
        await editOriginalResponse(interactionToken, {
          content: 'Something went wrong completing your signup. Please try again or use the website.',
          components: [],
        }).catch(() => {});
      }
    });

    return NextResponse.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
  }

  return ephemeral('Unsupported interaction.');
}

// Calls back into this same deployment's public API. On a Vercel preview
// deployment behind Deployment Protection, an unauthenticated request here
// gets rejected with Vercel's own {"error":{"code","message"}} shape rather
// than reaching our route at all — the bypass secret Vercel auto-populates
// once "Protection Bypass for Automation" is enabled lets server-to-server
// calls like this one through. No-op (header omitted) when unset, e.g. in
// production if protection isn't enabled there.
async function internalApiFetch(path: string, body: unknown) {
  return fetch(`${process.env.NEXT_PUBLIC_APP_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

async function submitShiftSignup(shiftId: string, name: string, email: string, discordUserId: string | null): Promise<string> {
  const res = await internalApiFetch('/api/volunteer-registrations/batch', {
    name, email, attendee_type: 'volunteer', shift_ids: [shiftId], discord_user_id: discordUserId,
  });
  const data = await res.json();
  if (!res.ok) return `Signup failed: ${typeof data.error === 'string' ? data.error : 'unknown error'}`;
  const reg = data.registrations?.[0];
  const result = reg?.isWaitlisted
    ? `You're on the waitlist for "${reg.shiftName}". Check your email for details.`
    : `You're signed up for "${reg?.shiftName}"! Check your email for confirmation.`;

  if (discordUserId) {
    await sendDirectMessage(discordUserId, result).catch((e) => console.error('signup DM error:', e));
  }
  return result;
}

async function submitRsvpSignup(encodedId: string, name: string, email: string, discordUserId: string | null): Promise<string> {
  const [eventId, attendeeType] = encodedId.split(':');
  const res = await internalApiFetch('/api/volunteer-registrations', {
    name, email, event_id: eventId, attendee_type: attendeeType, discord_user_id: discordUserId,
  });
  const data = await res.json();
  if (!res.ok) return `Signup failed: ${typeof data.error === 'string' ? data.error : 'unknown error'}`;
  const result = `You're signed up! Check your email for confirmation.`;

  if (discordUserId) {
    await sendDirectMessage(discordUserId, result).catch((e) => console.error('signup DM error:', e));
  }
  return result;
}
