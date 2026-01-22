export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          event_id: string
          title: string
          description: string | null
          date: string
          time: string
          location: string
          image_url: string | null
          created_at: string
        }
      }
      shifts: {
        Row: {
          id: string
          event_id: string
          shift_id: number
          name: string
          description: string | null
          start_time: string
          end_time: string
          capacity: number
          filled: number
          created_at: string
        }
      }
      volunteer_registrations: {
        Row: {
          id: string
          shift_id: string
          name: string
          email: string
          phone: string | null
          registered_at: string
        }
        Insert: {
          id?: string
          shift_id: string
          name: string
          email: string
          phone?: string | null
          registered_at?: string
        }
      }
    }
  }
}
