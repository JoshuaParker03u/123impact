export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      automated_email_templates: {
        Row: {
          body: string
          created_at: string | null
          enabled: boolean | null
          event_id: string | null
          id: string
          name: string
          organization_id: string | null
          subject: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          enabled?: boolean | null
          event_id?: string | null
          id?: string
          name: string
          organization_id?: string | null
          subject: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          enabled?: boolean | null
          event_id?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          subject?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automated_email_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          event_id: string
          id: string
          is_override: boolean
          registration_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          event_id: string
          id?: string
          is_override?: boolean
          registration_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          event_id?: string
          id?: string
          is_override?: boolean
          registration_id?: string
        }
        Relationships: []
      }
      email_optouts: {
        Row: {
          email: string
          id: string
          opted_out_at: string
          purged_at: string | null
        }
        Insert: {
          email: string
          id?: string
          opted_out_at?: string
          purged_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          opted_out_at?: string
          purged_at?: string | null
        }
        Relationships: []
      }
      event_admin_assignments: {
        Row: {
          co_sponsor: boolean
          co_sponsor_org_id: string | null
          created_at: string | null
          data_policy_accepted_at: string | null
          email: string
          event_id: string
          expires_at: string
          id: string
          invited_by: string
          status: string
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          co_sponsor?: boolean
          co_sponsor_org_id?: string | null
          created_at?: string | null
          data_policy_accepted_at?: string | null
          email: string
          event_id: string
          expires_at: string
          id?: string
          invited_by: string
          status?: string
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          co_sponsor?: boolean
          co_sponsor_org_id?: string | null
          created_at?: string | null
          data_policy_accepted_at?: string | null
          email?: string
          event_id?: string
          expires_at?: string
          id?: string
          invited_by?: string
          status?: string
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_admin_assignments_co_sponsor_org_id_fkey"
            columns: ["co_sponsor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_admin_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_day_hours: {
        Row: {
          created_at: string | null
          end_time: string
          event_date: string
          event_id: string
          id: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          event_date: string
          event_id: string
          id?: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          event_date?: string
          event_id?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_day_hours_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_speaker_invites: {
        Row: {
          created_at: string | null
          email: string
          event_id: string
          expires_at: string
          id: string
          invited_by: string
          registration_id: string | null
          session_time: string | null
          status: string
          token: string
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          event_id: string
          expires_at: string
          id?: string
          invited_by: string
          registration_id?: string | null
          session_time?: string | null
          status?: string
          token?: string
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          event_id?: string
          expires_at?: string
          id?: string
          invited_by?: string
          registration_id?: string | null
          session_time?: string | null
          status?: string
          token?: string
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_speaker_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_speaker_invites_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "volunteer_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendee_capacity: number | null
          attendee_enabled: boolean
          co_sponsors: string[] | null
          created_at: string | null
          date: string
          description: string | null
          discord_message_id: string | null
          end_date: string | null
          event_format: string
          event_id: string
          external_id: string | null
          id: string
          image_url: string | null
          is_private_on_platform: boolean
          is_shiftless: boolean
          last_synced_at: string | null
          location: string
          online_url: string | null
          organization_id: string | null
          panels_enabled: boolean
          platform_image: string | null
          platform_source: string | null
          primary_owner_id: string | null
          recording_url: string | null
          series_id: string | null
          shiftless_capacity: number | null
          speaker_enabled: boolean
          status: string | null
          sync_fail_count: number
          sync_status: string | null
          time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          attendee_capacity?: number | null
          attendee_enabled?: boolean
          co_sponsors?: string[] | null
          created_at?: string | null
          date: string
          description?: string | null
          discord_message_id?: string | null
          end_date?: string | null
          event_format?: string
          event_id: string
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_private_on_platform?: boolean
          is_shiftless?: boolean
          last_synced_at?: string | null
          location: string
          online_url?: string | null
          organization_id?: string | null
          panels_enabled?: boolean
          platform_image?: string | null
          platform_source?: string | null
          primary_owner_id?: string | null
          recording_url?: string | null
          series_id?: string | null
          shiftless_capacity?: number | null
          speaker_enabled?: boolean
          status?: string | null
          sync_fail_count?: number
          sync_status?: string | null
          time: string
          title: string
          updated_at?: string | null
        }
        Update: {
          attendee_capacity?: number | null
          attendee_enabled?: boolean
          co_sponsors?: string[] | null
          created_at?: string | null
          date?: string
          description?: string | null
          discord_message_id?: string | null
          end_date?: string | null
          event_format?: string
          event_id?: string
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_private_on_platform?: boolean
          is_shiftless?: boolean
          last_synced_at?: string | null
          location?: string
          online_url?: string | null
          organization_id?: string | null
          panels_enabled?: boolean
          platform_image?: string | null
          platform_source?: string | null
          primary_owner_id?: string | null
          recording_url?: string | null
          series_id?: string | null
          shiftless_capacity?: number | null
          speaker_enabled?: boolean
          status?: string | null
          sync_fail_count?: number
          sync_status?: string | null
          time?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          delivery_status: string | null
          error_message: string | null
          event_id: string | null
          id: string
          organization_id: string | null
          panel_id: string | null
          recipient_count: number | null
          recipient_emails: string[] | null
          recipient_ids: string[] | null
          recipient_type: string
          scheduled_for: string | null
          sent_at: string | null
          sent_by: string | null
          shift_id: string | null
          subject: string
        }
        Insert: {
          body: string
          created_at?: string | null
          delivery_status?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          organization_id?: string | null
          panel_id?: string | null
          recipient_count?: number | null
          recipient_emails?: string[] | null
          recipient_ids?: string[] | null
          recipient_type: string
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          shift_id?: string | null
          subject: string
        }
        Update: {
          body?: string
          created_at?: string | null
          delivery_status?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          organization_id?: string | null
          panel_id?: string | null
          recipient_count?: number | null
          recipient_emails?: string[] | null
          recipient_ids?: string[] | null
          recipient_type?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          shift_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      org_custom_domains: {
        Row: {
          banner_image_url: string | null
          created_at: string
          dns_admin_email: string | null
          header_links: Json
          id: string
          organization_id: string
          primary_color: string | null
          secondary_color: string | null
          ssl_expires_at: string | null
          status: string
          subdomain: string
          token_expires_at: string
          updated_at: string
          verification_token: string
        }
        Insert: {
          banner_image_url?: string | null
          created_at?: string
          dns_admin_email?: string | null
          header_links?: Json
          id?: string
          organization_id: string
          primary_color?: string | null
          secondary_color?: string | null
          ssl_expires_at?: string | null
          status?: string
          subdomain: string
          token_expires_at: string
          updated_at?: string
          verification_token: string
        }
        Update: {
          banner_image_url?: string | null
          created_at?: string
          dns_admin_email?: string | null
          header_links?: Json
          id?: string
          organization_id?: string
          primary_color?: string | null
          secondary_color?: string | null
          ssl_expires_at?: string | null
          status?: string
          subdomain?: string
          token_expires_at?: string
          updated_at?: string
          verification_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_admins: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          permissions: Json | null
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          permissions?: Json | null
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          permissions?: Json | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_admins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          status: string
          token: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role: string
          status?: string
          token?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_volunteers: {
        Row: {
          created_at: string | null
          first_volunteer_date: string | null
          id: string
          notes: string | null
          organization_id: string
          status: string | null
          total_hours_volunteered: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_volunteer_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          status?: string | null
          total_hours_volunteered?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_volunteer_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string | null
          total_hours_volunteered?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_volunteers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          billing_interval: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          current_period_end: string | null
          description: string | null
          grace_period_end: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string
          state: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          timezone: string | null
          updated_at: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          billing_interval?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          current_period_end?: string | null
          description?: string | null
          grace_period_end?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          state?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          billing_interval?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          current_period_end?: string | null
          description?: string | null
          grace_period_end?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          state?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      panel_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string
          id: string
          panel_id: string
          registration_id: string
          role: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by: string
          id?: string
          panel_id: string
          registration_id: string
          role: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string
          id?: string
          panel_id?: string
          registration_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_assignments_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_assignments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "volunteer_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          allow_waitlist: boolean
          capacity: number
          created_at: string | null
          description: string | null
          discord_message_id: string | null
          end_time: string
          event_id: string
          id: string
          location: string | null
          name: string
          online_url: string | null
          panel_date: string | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          allow_waitlist?: boolean
          capacity: number
          created_at?: string | null
          description?: string | null
          discord_message_id?: string | null
          end_time: string
          event_id: string
          id?: string
          location?: string | null
          name: string
          online_url?: string | null
          panel_date?: string | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          allow_waitlist?: boolean
          capacity?: number
          created_at?: string | null
          description?: string | null
          discord_message_id?: string | null
          end_time?: string
          event_id?: string
          id?: string
          location?: string | null
          name?: string
          online_url?: string | null
          panel_date?: string | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "panels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token: string | null
          announcement_channel_id: string | null
          channel_id: string | null
          connected_at: string
          connected_by: string | null
          external_org_id: string | null
          external_org_name: string | null
          id: string
          organization_id: string
          platform: string
          refresh_token: string | null
          sync_new_events: boolean
          token_expires_at: string | null
          welcome_message_sent_at: string | null
        }
        Insert: {
          access_token?: string | null
          announcement_channel_id?: string | null
          channel_id?: string | null
          connected_at?: string
          connected_by?: string | null
          external_org_id?: string | null
          external_org_name?: string | null
          id?: string
          organization_id: string
          platform: string
          refresh_token?: string | null
          sync_new_events?: boolean
          token_expires_at?: string | null
          welcome_message_sent_at?: string | null
        }
        Update: {
          access_token?: string | null
          announcement_channel_id?: string | null
          channel_id?: string | null
          connected_at?: string
          connected_by?: string | null
          external_org_id?: string | null
          external_org_name?: string | null
          id?: string
          organization_id?: string
          platform?: string
          refresh_token?: string | null
          sync_new_events?: boolean
          token_expires_at?: string | null
          welcome_message_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_code_instances: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          is_active: boolean
          label: string
          organization_id: string
          ref_token: string
          target_role: string
          type: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id: string
          ref_token?: string
          target_role?: string
          type?: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          ref_token?: string
          target_role?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_code_instances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_code_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_events: {
        Row: {
          event_id: string
          id: string
          instance_id: string
          scan_date: string
        }
        Insert: {
          event_id: string
          id?: string
          instance_id: string
          scan_date?: string
        }
        Update: {
          event_id?: string
          id?: string
          instance_id?: string
          scan_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_scan_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "qr_code_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          body: string
          created_at: string | null
          discord_user_id: string | null
          dm_status: string | null
          error_message: string | null
          event_id: string | null
          id: string
          message_id: string | null
          organization_id: string | null
          panel_id: string | null
          scheduled_for: string
          sent_at: string | null
          shift_id: string | null
          shift_registration_id: string | null
          status: string | null
          subject: string
          template_id: string | null
          user_id: string | null
          volunteer_email: string | null
          volunteer_name: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          discord_user_id?: string | null
          dm_status?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string | null
          panel_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          shift_id?: string | null
          shift_registration_id?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          user_id?: string | null
          volunteer_email?: string | null
          volunteer_name?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          discord_user_id?: string | null
          dm_status?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string | null
          panel_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          shift_id?: string | null
          shift_registration_id?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          user_id?: string | null
          volunteer_email?: string | null
          volunteer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_shift_registration_id_fkey"
            columns: ["shift_registration_id"]
            isOneToOne: false
            referencedRelation: "shift_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "automated_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_registrations: {
        Row: {
          id: string
          notes: string | null
          registered_at: string | null
          shift_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          registered_at?: string | null
          shift_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          registered_at?: string | null
          shift_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_registrations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          allow_waitlist: boolean
          capacity: number
          created_at: string | null
          description: string | null
          end_time: string
          event_id: string | null
          filled: number | null
          id: string
          name: string
          shift_date: string | null
          shift_id: number
          start_time: string
          updated_at: string | null
        }
        Insert: {
          allow_waitlist?: boolean
          capacity: number
          created_at?: string | null
          description?: string | null
          end_time: string
          event_id?: string | null
          filled?: number | null
          id?: string
          name: string
          shift_date?: string | null
          shift_id: number
          start_time: string
          updated_at?: string | null
        }
        Update: {
          allow_waitlist?: boolean
          capacity?: number
          created_at?: string | null
          description?: string | null
          end_time?: string
          event_id?: string | null
          filled?: number | null
          id?: string
          name?: string
          shift_date?: string | null
          shift_id?: number
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      usernames: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      volunteer_registrations: {
        Row: {
          attendee_type: string
          discord_user_id: string | null
          email: string
          event_id: string | null
          id: string
          is_waitlisted: boolean
          name: string
          panel_id: string | null
          phone: string | null
          photo_url: string | null
          public_consent: boolean
          registered_at: string | null
          shift_id: string | null
          speaker_bio: string | null
          speaker_topic: string | null
        }
        Insert: {
          attendee_type?: string
          discord_user_id?: string | null
          email: string
          event_id?: string | null
          id?: string
          is_waitlisted?: boolean
          name: string
          panel_id?: string | null
          phone?: string | null
          photo_url?: string | null
          public_consent?: boolean
          registered_at?: string | null
          shift_id?: string | null
          speaker_bio?: string | null
          speaker_topic?: string | null
        }
        Update: {
          attendee_type?: string
          discord_user_id?: string | null
          email?: string
          event_id?: string | null
          id?: string
          is_waitlisted?: boolean
          name?: string
          panel_id?: string | null
          phone?: string | null
          photo_url?: string | null
          public_consent?: boolean
          registered_at?: string | null
          shift_id?: string | null
          speaker_bio?: string | null
          speaker_topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_registrations_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_registrations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      auth_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      auth_is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      auth_user_org_ids: { Args: never; Returns: string[] }
      can_user_manage_event: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: boolean
      }
      decrement_shift_filled: {
        Args: { p_shift_id: string }
        Returns: undefined
      }
      get_shift_volunteer_count: {
        Args: { shift_uuid: string }
        Returns: number
      }
      get_user_id_by_identifier: {
        Args: { identifier: string }
        Returns: string
      }
      is_shift_full: { Args: { shift_uuid: string }; Returns: boolean }
      is_username_available: {
        Args: { check_username: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

