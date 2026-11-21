export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device: string | null
          id: string
          ip: string | null
          last_seen: string
          os: string | null
          session_key: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          last_seen?: string
          os?: string | null
          session_key: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          last_seen?: string
          os?: string | null
          session_key?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          payload: Json
          reason: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          reason: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          reason?: string
          target_id?: string | null
        }
        Relationships: []
      }
      chat_channels: {
        Row: {
          announcement_only: boolean
          frozen: boolean
          name: string
          slug: string
        }
        Insert: {
          announcement_only?: boolean
          frozen?: boolean
          name: string
          slug: string
        }
        Update: {
          announcement_only?: boolean
          frozen?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          due_notice_sent_at: string | null
          id: string
          paid_at: string | null
          project_id: string
          reminder_sent_at: string | null
          status: string
          thanks_sent_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          due_notice_sent_at?: string | null
          id?: string
          paid_at?: string | null
          project_id: string
          reminder_sent_at?: string | null
          status?: string
          thanks_sent_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          due_notice_sent_at?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string
          reminder_sent_at?: string | null
          status?: string
          thanks_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      login_origin_security: {
        Row: {
          admin_locked: boolean
          attempt_token: string | null
          attempt_until: string | null
          failed_count: number
          locked_until: string | null
          origin_key: string
          updated_at: string
        }
        Insert: {
          admin_locked?: boolean
          attempt_token?: string | null
          attempt_until?: string | null
          failed_count?: number
          locked_until?: string | null
          origin_key: string
          updated_at?: string
        }
        Update: {
          admin_locked?: boolean
          attempt_token?: string | null
          attempt_until?: string | null
          failed_count?: number
          locked_until?: string | null
          origin_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_security: {
        Row: {
          admin_locked: boolean
          email: string
          failed_count: number
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          admin_locked?: boolean
          email: string
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          admin_locked?: boolean
          email?: string
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          author_id: string
          contact: string | null
          content: string
          created_at: string
          id: string
          kind: string
          title: string
        }
        Insert: {
          author_id?: string
          contact?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          title: string
        }
        Update: {
          author_id?: string
          contact?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          title?: string
        }
        Relationships: []
      }
      pin_attempts: {
        Row: {
          failed_count: number
          locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          department: Database["public"]["Enums"]["department"] | null
          email: string
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          email: string
          full_name?: string
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
      }
      project_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          project_id: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          project_id: string
          title: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          project_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billing_enabled: boolean
          client_id: string
          contract_start: string
          created_at: string
          ga4_property_id: string | null
          id: string
          instagram_handle: string | null
          is_ecommerce: boolean
          kind: string
          name: string
          project_number: number | null
          publish_status: string
          setup_price: number
          uptime_checked_at: string | null
          uptime_latency_ms: number | null
          uptime_status: string
          url: string | null
        }
        Insert: {
          billing_enabled?: boolean
          client_id: string
          contract_start?: string
          created_at?: string
          ga4_property_id?: string | null
          id?: string
          instagram_handle?: string | null
          is_ecommerce?: boolean
          kind?: string
          name: string
          project_number?: number | null
          publish_status?: string
          setup_price?: number
          uptime_checked_at?: string | null
          uptime_latency_ms?: number | null
          uptime_status?: string
          url?: string | null
        }
        Update: {
          billing_enabled?: boolean
          client_id?: string
          contract_start?: string
          created_at?: string
          ga4_property_id?: string | null
          id?: string
          instagram_handle?: string | null
          is_ecommerce?: boolean
          kind?: string
          name?: string
          project_number?: number | null
          publish_status?: string
          setup_price?: number
          uptime_checked_at?: string | null
          uptime_latency_ms?: number | null
          uptime_status?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          attempts: number
          browser: string | null
          created_at: string
          device: string | null
          email: string
          full_name: string | null
          geo: string | null
          id: string
          ip: string | null
          lock_scope: string
          origin_key: string | null
          os: string | null
          phone: string | null
          resolved: boolean
          resolved_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempts?: number
          browser?: string | null
          created_at?: string
          device?: string | null
          email: string
          full_name?: string | null
          geo?: string | null
          id?: string
          ip?: string | null
          lock_scope?: string
          origin_key?: string | null
          os?: string | null
          phone?: string | null
          resolved?: boolean
          resolved_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempts?: number
          browser?: string | null
          created_at?: string
          device?: string | null
          email?: string
          full_name?: string | null
          geo?: string | null
          id?: string
          ip?: string | null
          lock_scope?: string
          origin_key?: string | null
          os?: string | null
          phone?: string | null
          resolved?: boolean
          resolved_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      site_events: {
        Row: {
          event_id: string
          id: string
          kind: string
          occurred_at: string
          project_id: string
        }
        Insert: {
          event_id: string
          id?: string
          kind: string
          occurred_at?: string
          project_id: string
        }
        Update: {
          event_id?: string
          id?: string
          kind?: string
          occurred_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_two_factor: {
        Row: {
          code_expires_at: string | null
          code_hash: string | null
          codes_sent: number
          completed_logins: number
          cycle_started_at: string | null
          failed_attempts: number
          last_code_sent_at: string | null
          locked_until: string | null
          manual_release_until: string | null
          release_requested_at: string | null
          sac_ticket_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code_expires_at?: string | null
          code_hash?: string | null
          codes_sent?: number
          completed_logins?: number
          cycle_started_at?: string | null
          failed_attempts?: number
          last_code_sent_at?: string | null
          locked_until?: string | null
          manual_release_until?: string | null
          release_requested_at?: string | null
          sac_ticket_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code_expires_at?: string | null
          code_hash?: string | null
          codes_sent?: number
          completed_logins?: number
          cycle_started_at?: string | null
          failed_attempts?: number
          last_code_sent_at?: string | null
          locked_until?: string | null
          manual_release_until?: string | null
          release_requested_at?: string | null
          sac_ticket_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_two_factor_sac_ticket_id_fkey"
            columns: ["sac_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_two_factor_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          role: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          role: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          client_id: string
          created_at: string
          id: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          billing_enabled: boolean
          id: number
          maintenance_mode: boolean
          master_pin_hash: string | null
          updated_at: string
          uptime_enabled: boolean
        }
        Insert: {
          billing_enabled?: boolean
          id?: number
          maintenance_mode?: boolean
          master_pin_hash?: string | null
          updated_at?: string
          uptime_enabled?: boolean
        }
        Update: {
          billing_enabled?: boolean
          id?: number
          maintenance_mode?: boolean
          master_pin_hash?: string | null
          updated_at?: string
          uptime_enabled?: boolean
        }
        Relationships: []
      }
      uptime_probe_leases: {
        Row: {
          lease_token: string | null
          lease_until: string | null
          next_allowed_at: string
          project_id: string
        }
        Insert: {
          lease_token?: string | null
          lease_until?: string | null
          next_allowed_at?: string
          project_id: string
        }
        Update: {
          lease_token?: string | null
          lease_until?: string | null
          next_allowed_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uptime_probe_leases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_uptime_probe: {
        Args: { _project: string; _token: string }
        Returns: boolean
      }
      begin_origin_login: {
        Args: { _key: string; _token: string }
        Returns: Json
      }
      can_access_channel: {
        Args: { _channel: string; _uid: string }
        Returns: boolean
      }
      can_revoke_session: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      finish_origin_login: {
        Args: {
          _email: string
          _fingerprint: Json
          _key: string
          _success: boolean
          _token: string
        }
        Returns: Json
      }
      finish_uptime_probe: {
        Args: {
          _latency: number
          _project: string
          _status: string
          _token: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_site_event: {
        Args: { _event: string; _kind: string; _project: string }
        Returns: undefined
      }
      is_owner_email: { Args: { _email: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      release_origin_login: {
        Args: { _actor_id: string; _alert_id: string; _reason: string }
        Returns: undefined
      }
      site_analytics_summary: { Args: { _project: string }; Returns: Json }
      user_department: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["department"]
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "deleted"
      app_role: "owner" | "partner" | "admin" | "client"
      department: "juridico" | "execucao"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "deleted"],
      app_role: ["owner", "partner", "admin", "client"],
      department: ["juridico", "execucao"],
    },
  },
} as const
