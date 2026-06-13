export type UserRole = 'admin' | 'sales'

export type PlotStatusDb = 'available' | 'reserved' | 'sold' | 'employee_reserved'

export type SalesLogAction = 'reserved' | 'sold' | 'released' | 'price_changed' | 'employee_reserved'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          name?: string
          role?: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: UserRole
          created_at?: string
        }
        Relationships: []
      }
      maps: {
        Row: {
          id: string
          name: string
          data: Record<string, unknown>
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string
          data: Record<string, unknown>
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          data?: Record<string, unknown>
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plot_state: {
        Row: {
          map_id: string
          plot_id: string
          status: PlotStatusDb
          price: number | null
          employee_price: number | null
          customer_name: string | null
          note: string | null
          reserved_at: string | null
          reserved_until: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          map_id?: string
          plot_id: string
          status?: PlotStatusDb
          price?: number | null
          employee_price?: number | null
          customer_name?: string | null
          note?: string | null
          reserved_at?: string | null
          reserved_until?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          map_id?: string
          plot_id?: string
          status?: PlotStatusDb
          price?: number | null
          employee_price?: number | null
          customer_name?: string | null
          note?: string | null
          reserved_at?: string | null
          reserved_until?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_log: {
        Row: {
          id: string
          map_id: string
          plot_id: string
          actor_id: string | null
          action: SalesLogAction
          from_status: string | null
          to_status: string | null
          customer_name: string | null
          price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          map_id?: string
          plot_id: string
          actor_id?: string | null
          action: SalesLogAction
          from_status?: string | null
          to_status?: string | null
          customer_name?: string | null
          price?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          map_id?: string
          plot_id?: string
          actor_id?: string | null
          action?: SalesLogAction
          from_status?: string | null
          to_status?: string | null
          customer_name?: string | null
          price?: number | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      delete_employee: {
        Args: { target_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
