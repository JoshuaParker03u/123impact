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
  getOpenPanelsForEvent,
  getEventById,
  getQualificationFormUrl,
  getQualificationFormUrlForOrg,
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

// Shown on the event/shift/panel picker messages, before the modal opens --
// Discord modals can't contain a clickable link or any static text beyond
// field labels, so this is the only place in the pre-signup flow where
// someone could actually see it. withQualificationFormLink (below) covers
// the post-signup DM separately, with its own confirmation-flavored wording.
function withQualificationFormNote(content: string, formUrl: string | null): string {
  return formUrl ? `${content}\n\n📋 Please also complete our Volunteer/Moderator Questionnaire: ${formUrl}` : content;
}

// No email field -- Discord already knows who's signing up (discordUserId,
// threaded through separately from interaction.member/user.id), so the only
// thing worth asking for here is how they want to be addressed.
function signupModal(customId: string) {
  return NextResponse.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: customId,
      title: 'Sign Up',
      components: [
        { type: 1, components: [{ type: 4, custom_id: 'name', label: 'Preferred Name', style: 1, required: true }] },
        { type: 1, components: [{ type: 4, custom_id: 'pronouns', label: 'Pronouns (optional)', style: 1, required: false }] },
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

    const formUrl = await getQualificationFormUrlForOrg(connection.organization_id).catch(() => null);
    return ephemeral(withQualificationFormNote('Choose an event:', formUrl), selectMenuRow('select_event', 'Choose an event', options));
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id;
    const selectedValue = interaction.data?.values?.[0];

    if (customId === 'select_event') {
      const eventId = selectedValue;
      const formUrl = await getQualificationFormUrl({ eventId }).catch(() => null);
      const { shifts, hasAnyShifts } = await getOpenShiftsForEvent(eventId, interaction.member?.user?.id ?? interaction.user?.id ?? null);

      if (shifts.length > 0) {
        const options = shifts.map((s) => ({
          label: `${s.name} (${s.start_time}-${s.end_time})`.slice(0, 100),
          value: s.id,
          description: s.is_full ? 'Waitlist' : `${s.available} spot${s.available === 1 ? '' : 's'} open`,
        }));
        return updateMessage(withQualificationFormNote('Choose a shift:', formUrl), selectMenuRow('select_shift', 'Choose a shift', options));
      }

      if (hasAnyShifts) {
        return updateMessage('No shifts are available to you for this event right now — you may have already signed up for all of them.', []);
      }

      const event = await getEventById(eventId);
      if (!event) return ephemeral('That event could not be found.');

      if (event.panels_enabled) {
        const { panels, hasAnyPanels } = await getOpenPanelsForEvent(eventId, interaction.member?.user?.id ?? interaction.user?.id ?? null);

        if (panels.length > 0) {
          const options = panels.map((p) => ({
            label: `${p.name} (${p.start_time}-${p.end_time})`.slice(0, 100),
            value: p.id,
            description: p.is_full ? 'Waitlist' : p.available == null ? 'Open' : `${p.available} spot${p.available === 1 ? '' : 's'} open`,
          }));
          return updateMessage(withQualificationFormNote('Choose a panel:', formUrl), selectMenuRow('select_panel', 'Choose a panel', options));
        }

        if (hasAnyPanels) {
          return updateMessage('No panels are available to you for this event right now — you may have already signed up for all of them.', []);
        }
      }

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

    if (customId === 'select_panel') {
      const panelId = selectedValue;
      return signupModal(encodeCustomId('signup_modal_panel', panelId));
    }

    return ephemeral('Something went wrong — please run /signup again.');
  }

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const decoded = decodeCustomId(interaction.data?.custom_id ?? '');
    if (!decoded) return ephemeral('Something went wrong — please run /signup again.');

    const rows: { components: { custom_id: string; value: string }[] }[] = interaction.data.components ?? [];
    const fields = rows.flatMap((row) => row.components);
    const name = fields.find((f) => f.custom_id === 'name')?.value?.trim();
    const pronouns = fields.find((f) => f.custom_id === 'pronouns')?.value?.trim() || null;
    const interactionToken = interaction.token;
    const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
    const discordUsername = interaction.member?.user?.username ?? interaction.user?.username ?? null;

    after(async () => {
      try {
        const result = decoded.kind === 'signup_modal_shift'
          ? await submitShiftSignup(decoded.id, name!, pronouns, discordUserId, discordUsername)
          : decoded.kind === 'signup_modal_panel'
          ? await submitPanelSignup(decoded.id, name!, pronouns, discordUserId, discordUsername)
          : await submitRsvpSignup(decoded.id, name!, pronouns, discordUserId, discordUsername);
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

// Every bot signup's confirmation is this same DM -- there's no email to
// "check" anymore, so the DM is the whole confirmation, with the
// qualification-form link (if the org has one set) appended.
async function withQualificationFormLink(message: string, target: { shiftId?: string; panelId?: string; eventId?: string }): Promise<string> {
  const formUrl = await getQualificationFormUrl(target).catch(() => null);
  return formUrl ? `${message}\n\nPlease also complete our Volunteer/Moderator Questionnaire: ${formUrl}` : message;
}

async function submitShiftSignup(shiftId: string, name: string, pronouns: string | null, discordUserId: string | null, discordUsername: string | null): Promise<string> {
  const res = await internalApiFetch('/api/volunteer-registrations/batch', {
    name, pronouns, attendee_type: 'volunteer', shift_ids: [shiftId], discord_user_id: discordUserId, discord_username: discordUsername,
  });
  const data = await res.json();
  if (!res.ok) return `Signup failed: ${typeof data.error === 'string' ? data.error : 'unknown error'}`;
  const reg = data.registrations?.[0];
  let result = data.alreadyRegistered
    ? `You were already registered for "${reg?.shiftName}" — linked this Discord account to it.`
    : reg?.isWaitlisted
    ? `You're on the waitlist for "${reg.shiftName}".`
    : `You're signed up for "${reg?.shiftName}"!`;
  result = await withQualificationFormLink(result, { shiftId });

  if (discordUserId) {
    await sendDirectMessage(discordUserId, result).catch((e) => console.error('signup DM error:', e));
  }
  return result;
}

async function submitPanelSignup(panelId: string, name: string, pronouns: string | null, discordUserId: string | null, discordUsername: string | null): Promise<string> {
  const res = await internalApiFetch('/api/panel-registrations', {
    name, pronouns, panel_id: panelId, discord_user_id: discordUserId, discord_username: discordUsername,
  });
  const data = await res.json();
  if (!res.ok) return `Signup failed: ${typeof data.error === 'string' ? data.error : 'unknown error'}`;
  let result = data.alreadyRegistered
    ? `You were already registered for "${data.panelName}" — linked this Discord account to it.`
    : data.isWaitlisted
    ? `You're on the waitlist for "${data.panelName}".`
    : `You're signed up for "${data.panelName}"!`;
  result = await withQualificationFormLink(result, { panelId });

  if (discordUserId) {
    await sendDirectMessage(discordUserId, result).catch((e) => console.error('signup DM error:', e));
  }
  return result;
}

async function submitRsvpSignup(encodedId: string, name: string, pronouns: string | null, discordUserId: string | null, discordUsername: string | null): Promise<string> {
  const [eventId, attendeeType] = encodedId.split(':');
  const res = await internalApiFetch('/api/volunteer-registrations', {
    name, pronouns, event_id: eventId, attendee_type: attendeeType, discord_user_id: discordUserId, discord_username: discordUsername,
  });
  const data = await res.json();
  if (!res.ok) return `Signup failed: ${typeof data.error === 'string' ? data.error : 'unknown error'}`;
  let result = data.alreadyRegistered
    ? `You were already registered for this event — linked this Discord account to it.`
    : `You're signed up!`;
  result = await withQualificationFormLink(result, { eventId });

  if (discordUserId) {
    await sendDirectMessage(discordUserId, result).catch((e) => console.error('signup DM error:', e));
  }
  return result;
}
