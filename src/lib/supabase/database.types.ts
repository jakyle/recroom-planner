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
    PostgrestVersion: "14.5"
  }
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
      activity: {
        Row: {
          at: string
          id: number
          op: string
          project_id: string
          row_id: string
          scenario_id: string | null
          summary: Json
          table_name: string
          user_id: string | null
        }
        Insert: {
          at?: string
          id?: number
          op: string
          project_id: string
          row_id: string
          scenario_id?: string | null
          summary?: Json
          table_name: string
          user_id?: string | null
        }
        Update: {
          at?: string
          id?: number
          op?: string
          project_id?: string
          row_id?: string
          scenario_id?: string | null
          summary?: Json
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      circuits: {
        Row: {
          amps: number
          id: string
          name: string
          panel_object_id: string
          pole: number
          scenario_id: string
          slot: number
          updated_at: string
          updated_by: string | null
          version: number
          voltage: number
        }
        Insert: {
          amps?: number
          id?: string
          name?: string
          panel_object_id: string
          pole?: number
          scenario_id: string
          slot: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          voltage?: number
        }
        Update: {
          amps?: number
          id?: string
          name?: string
          panel_object_id?: string
          pole?: number
          scenario_id?: string
          slot?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          voltage?: number
        }
        Relationships: [
          {
            foreignKeyName: "circuits_panel_object_id_fkey"
            columns: ["panel_object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuits_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_attempts: {
        Row: {
          at: string
          user_id: string
        }
        Insert: {
          at?: string
          user_id: string
        }
        Update: {
          at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          anchor: Database["public"]["Enums"]["comment_anchor"]
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          object_id: string | null
          parent_id: string | null
          resolved: boolean
          scenario_id: string
          updated_at: string
          updated_by: string | null
          version: number
          x: number | null
          y: number | null
        }
        Insert: {
          anchor: Database["public"]["Enums"]["comment_anchor"]
          author_id: string
          author_name?: string
          body: string
          created_at?: string
          id?: string
          object_id?: string | null
          parent_id?: string | null
          resolved?: boolean
          scenario_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          x?: number | null
          y?: number | null
        }
        Update: {
          anchor?: Database["public"]["Enums"]["comment_anchor"]
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          object_id?: string | null
          parent_id?: string | null
          resolved?: boolean
          scenario_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_acks: {
        Row: {
          created_at: string
          key: string
          note: string
          rule_id: string
          scenario_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          note?: string
          rule_id: string
          scenario_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          key?: string
          note?: string
          rule_id?: string
          scenario_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_acks_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      layers: {
        Row: {
          builtin: boolean
          color: string
          id: string
          key: string
          locked: boolean
          name: string
          project_id: string
          sort: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          builtin?: boolean
          color?: string
          id?: string
          key: string
          locked?: boolean
          name: string
          project_id: string
          sort?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          builtin?: boolean
          color?: string
          id?: string
          key?: string
          locked?: boolean
          name?: string
          project_id?: string
          sort?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_groups: {
        Row: {
          id: string
          name: string
          scenario_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          id?: string
          name?: string
          scenario_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          id?: string
          name?: string
          scenario_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_groups_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      objects: {
        Row: {
          d: number
          group_id: string | null
          h: number
          halo: Json | null
          id: string
          image_path: string | null
          layer_id: string
          locked: boolean
          mount: Database["public"]["Enums"]["mount_kind"]
          name: string
          preset_id: string | null
          props: Json
          rot: number
          scenario_id: string
          tags: string[]
          updated_at: string
          updated_by: string | null
          version: number
          w: number
          wall_id: string | null
          x: number
          y: number
          z: number
          z_order: number
        }
        Insert: {
          d: number
          group_id?: string | null
          h: number
          halo?: Json | null
          id?: string
          image_path?: string | null
          layer_id: string
          locked?: boolean
          mount?: Database["public"]["Enums"]["mount_kind"]
          name?: string
          preset_id?: string | null
          props?: Json
          rot?: number
          scenario_id: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
          w: number
          wall_id?: string | null
          x?: number
          y?: number
          z?: number
          z_order?: number
        }
        Update: {
          d?: number
          group_id?: string | null
          h?: number
          halo?: Json | null
          id?: string
          image_path?: string | null
          layer_id?: string
          locked?: boolean
          mount?: Database["public"]["Enums"]["mount_kind"]
          name?: string
          preset_id?: string | null
          props?: Json
          rot?: number
          scenario_id?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
          w?: number
          wall_id?: string | null
          x?: number
          y?: number
          z?: number
          z_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "objects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "object_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objects_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "walls"
            referencedColumns: ["id"]
          },
        ]
      }
      openings: {
        Row: {
          head: number
          hinge: Database["public"]["Enums"]["hinge_side"]
          id: string
          kind: Database["public"]["Enums"]["opening_kind"]
          label: string
          offset: number
          props: Json
          sill: number
          swing: Database["public"]["Enums"]["swing_kind"]
          updated_at: string
          updated_by: string | null
          version: number
          wall_id: string
          width: number
        }
        Insert: {
          head: number
          hinge?: Database["public"]["Enums"]["hinge_side"]
          id?: string
          kind: Database["public"]["Enums"]["opening_kind"]
          label?: string
          offset: number
          props?: Json
          sill?: number
          swing?: Database["public"]["Enums"]["swing_kind"]
          updated_at?: string
          updated_by?: string | null
          version?: number
          wall_id: string
          width: number
        }
        Update: {
          head?: number
          hinge?: Database["public"]["Enums"]["hinge_side"]
          id?: string
          kind?: Database["public"]["Enums"]["opening_kind"]
          label?: string
          offset?: number
          props?: Json
          sill?: number
          swing?: Database["public"]["Enums"]["swing_kind"]
          updated_at?: string
          updated_by?: string | null
          version?: number
          wall_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "openings_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "walls"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          category: string
          d: number
          h: number
          halo: Json | null
          id: string
          image_path: string | null
          layer_key: string
          mount: Database["public"]["Enums"]["mount_kind"]
          name: string
          project_id: string | null
          props: Json
          tags: string[]
          updated_at: string
          updated_by: string | null
          version: number
          w: number
        }
        Insert: {
          category: string
          d: number
          h: number
          halo?: Json | null
          id?: string
          image_path?: string | null
          layer_key: string
          mount?: Database["public"]["Enums"]["mount_kind"]
          name: string
          project_id?: string | null
          props?: Json
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
          w: number
        }
        Update: {
          category?: string
          d?: number
          h?: number
          halo?: Json | null
          id?: string
          image_path?: string | null
          layer_key?: string
          mount?: Database["public"]["Enums"]["mount_kind"]
          name?: string
          project_id?: string | null
          props?: Json
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
          w?: number
        }
        Relationships: [
          {
            foreignKeyName: "presets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          access: Database["public"]["Enums"]["access_level"]
          color: string
          display_name: string
          joined_at: string
          last_seen_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          access: Database["public"]["Enums"]["access_level"]
          color?: string
          display_name?: string
          joined_at?: string
          last_seen_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          access?: Database["public"]["Enums"]["access_level"]
          color?: string
          display_name?: string
          joined_at?: string
          last_seen_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          edit_token_hash: string
          id: string
          name: string
          owner_id: string
          settings: Json
          updated_at: string
          updated_by: string | null
          version: number
          view_token_hash: string
        }
        Insert: {
          created_at?: string
          edit_token_hash: string
          id?: string
          name: string
          owner_id: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
          view_token_hash: string
        }
        Update: {
          created_at?: string
          edit_token_hash?: string
          id?: string
          name?: string
          owner_id?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
          view_token_hash?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          finish: Database["public"]["Enums"]["finish_kind"]
          finish_props: Json
          id: string
          name: string
          polygon: Json
          scenario_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          finish?: Database["public"]["Enums"]["finish_kind"]
          finish_props?: Json
          id?: string
          name?: string
          polygon?: Json
          scenario_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          finish?: Database["public"]["Enums"]["finish_kind"]
          finish_props?: Json
          id?: string
          name?: string
          polygon?: Json
          scenario_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          circuit_id: string | null
          from_object_id: string | null
          from_port: string | null
          id: string
          layer_id: string
          points: Json
          props: Json
          scenario_id: string
          system: Database["public"]["Enums"]["system_kind"]
          to_object_id: string | null
          to_port: string | null
          updated_at: string
          updated_by: string | null
          version: number
          zone_id: string | null
        }
        Insert: {
          circuit_id?: string | null
          from_object_id?: string | null
          from_port?: string | null
          id?: string
          layer_id: string
          points?: Json
          props?: Json
          scenario_id: string
          system: Database["public"]["Enums"]["system_kind"]
          to_object_id?: string | null
          to_port?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          zone_id?: string | null
        }
        Update: {
          circuit_id?: string | null
          from_object_id?: string | null
          from_port?: string | null
          id?: string
          layer_id?: string
          points?: Json
          props?: Json
          scenario_id?: string
          system?: Database["public"]["Enums"]["system_kind"]
          to_object_id?: string | null
          to_port?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_circuit_id_fkey"
            columns: ["circuit_id"]
            isOneToOne: false
            referencedRelation: "circuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_from_object_id_fkey"
            columns: ["from_object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_to_object_id_fkey"
            columns: ["to_object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_wall_states: {
        Row: {
          scenario_id: string
          state: string
          wall_id: string
        }
        Insert: {
          scenario_id: string
          state: string
          wall_id: string
        }
        Update: {
          scenario_id?: string
          state?: string
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_wall_states_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_wall_states_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "walls"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          name: string
          parent_scenario_id: string | null
          project_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          name: string
          parent_scenario_id?: string | null
          project_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          parent_scenario_id?: string | null
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_parent_scenario_id_fkey"
            columns: ["parent_scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sheets: {
        Row: {
          code: string
          id: string
          layers: string[]
          paper: Database["public"]["Enums"]["paper_size"]
          scale: string
          scenario_id: string
          schedules: Json
          sort: number
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          view: Json
        }
        Insert: {
          code: string
          id?: string
          layers?: string[]
          paper?: Database["public"]["Enums"]["paper_size"]
          scale?: string
          scenario_id: string
          schedules?: Json
          sort?: number
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          view?: Json
        }
        Update: {
          code?: string
          id?: string
          layers?: string[]
          paper?: Database["public"]["Enums"]["paper_size"]
          scale?: string
          scenario_id?: string
          schedules?: Json
          sort?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          view?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sheets_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      slabs: {
        Row: {
          id: string
          insulation: Json
          notes: string
          polygon: Json
          scenario_id: string
          thickness: number
          updated_at: string
          updated_by: string | null
          vapor_barrier: boolean
          version: number
        }
        Insert: {
          id?: string
          insulation?: Json
          notes?: string
          polygon?: Json
          scenario_id: string
          thickness?: number
          updated_at?: string
          updated_by?: string | null
          vapor_barrier?: boolean
          version?: number
        }
        Update: {
          id?: string
          insulation?: Json
          notes?: string
          polygon?: Json
          scenario_id?: string
          thickness?: number
          updated_at?: string
          updated_by?: string | null
          vapor_barrier?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "slabs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["snapshot_kind"]
          name: string
          payload: Json
          scenario_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["snapshot_kind"]
          name: string
          payload: Json
          scenario_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["snapshot_kind"]
          name?: string
          payload?: Json
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      walls: {
        Row: {
          ax: number
          ay: number
          bx: number
          by: number
          framing: Database["public"]["Enums"]["framing_kind"]
          height: number
          id: string
          include_elevation: boolean
          label: string
          layer_id: string | null
          project_id: string
          scenario_id: string | null
          scope: Database["public"]["Enums"]["wall_scope"]
          state: Database["public"]["Enums"]["wall_state"]
          thickness: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          ax: number
          ay: number
          bx: number
          by: number
          framing?: Database["public"]["Enums"]["framing_kind"]
          height?: number
          id?: string
          include_elevation?: boolean
          label?: string
          layer_id?: string | null
          project_id: string
          scenario_id?: string | null
          scope: Database["public"]["Enums"]["wall_scope"]
          state?: Database["public"]["Enums"]["wall_state"]
          thickness?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          ax?: number
          ay?: number
          bx?: number
          by?: number
          framing?: Database["public"]["Enums"]["framing_kind"]
          height?: number
          id?: string
          include_elevation?: boolean
          label?: string
          layer_id?: string | null
          project_id?: string
          scenario_id?: string | null
          scope?: Database["public"]["Enums"]["wall_scope"]
          state?: Database["public"]["Enums"]["wall_state"]
          thickness?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "walls_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walls_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          design_btuh: number | null
          id: string
          manifold_object_id: string | null
          manifold_port: string | null
          name: string
          polygon: Json
          scenario_id: string
          spacing: number
          tubing: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          design_btuh?: number | null
          id?: string
          manifold_object_id?: string | null
          manifold_port?: string | null
          name?: string
          polygon?: Json
          scenario_id: string
          spacing?: number
          tubing?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          design_btuh?: number | null
          id?: string
          manifold_object_id?: string | null
          manifold_port?: string | null
          name?: string
          polygon?: Json
          scenario_id?: string
          spacing?: number
          tubing?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "zones_manifold_object_id_fkey"
            columns: ["manifold_object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zones_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_rank: {
        Args: { a: Database["public"]["Enums"]["access_level"] }
        Returns: number
      }
      apply_member_policies: {
        Args: { project_expr: string; tbl: string }
        Returns: undefined
      }
      build_scenario_payload: { Args: { p_scenario: string }; Returns: Json }
      claim_share_link: { Args: { p_token: string }; Returns: Json }
      create_project: {
        Args: { p_name: string; p_template?: string }
        Returns: Json
      }
      fork_scenario: {
        Args: { p_name: string; p_scenario: string }
        Returns: string
      }
      hash_token: { Args: { t: string }; Returns: string }
      is_member: {
        Args: {
          min_access: Database["public"]["Enums"]["access_level"]
          p: string
        }
        Returns: boolean
      }
      new_share_token: { Args: never; Returns: string }
      promote_scenario: { Args: { p_scenario: string }; Returns: undefined }
      rotate_share_link: {
        Args: { p_kind: string; p_project: string }
        Returns: string
      }
      scenario_project: { Args: { s: string }; Returns: string }
      seed_layers: { Args: { p_project: string }; Returns: undefined }
      seed_pool_room: { Args: { p_project: string }; Returns: undefined }
      set_display_name: {
        Args: { p_color?: string; p_name: string; p_project: string }
        Returns: undefined
      }
      setup_check: { Args: never; Returns: Json }
      touch_last_seen: { Args: { p_project: string }; Returns: undefined }
      wall_project: { Args: { w: string }; Returns: string }
    }
    Enums: {
      access_level: "view" | "edit" | "owner"
      comment_anchor: "point" | "object"
      finish_kind: "rubber_mat" | "lvp" | "carpet" | "concrete" | "other"
      framing_kind: "2x4" | "2x6" | "masonry" | "existing_unknown"
      hinge_side: "a_side" | "b_side" | "none"
      mount_kind: "floor" | "floor_anchored" | "wall" | "ceiling" | "recessed"
      opening_kind:
        | "door"
        | "double_door"
        | "slider"
        | "window"
        | "fireplace"
        | "cased_opening"
      paper_size: "ARCH_C" | "ARCH_D" | "ANSI_B"
      sheet_view_kind: "plan" | "elevation" | "rcp"
      snapshot_kind: "manual" | "auto_fork" | "auto_restore"
      swing_kind: "in" | "out" | "none"
      system_kind:
        | "cold"
        | "hot"
        | "dwv"
        | "vent"
        | "gas"
        | "v120"
        | "v240"
        | "lighting"
        | "switch_leg"
        | "low_voltage"
        | "speaker"
        | "hdmi"
        | "refrigerant"
        | "duct_supply"
        | "duct_return"
        | "pex_loop"
        | "pex_supply"
        | "pex_return"
      wall_scope: "shell" | "scenario"
      wall_state: "existing" | "new"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_level: ["view", "edit", "owner"],
      comment_anchor: ["point", "object"],
      finish_kind: ["rubber_mat", "lvp", "carpet", "concrete", "other"],
      framing_kind: ["2x4", "2x6", "masonry", "existing_unknown"],
      hinge_side: ["a_side", "b_side", "none"],
      mount_kind: ["floor", "floor_anchored", "wall", "ceiling", "recessed"],
      opening_kind: [
        "door",
        "double_door",
        "slider",
        "window",
        "fireplace",
        "cased_opening",
      ],
      paper_size: ["ARCH_C", "ARCH_D", "ANSI_B"],
      sheet_view_kind: ["plan", "elevation", "rcp"],
      snapshot_kind: ["manual", "auto_fork", "auto_restore"],
      swing_kind: ["in", "out", "none"],
      system_kind: [
        "cold",
        "hot",
        "dwv",
        "vent",
        "gas",
        "v120",
        "v240",
        "lighting",
        "switch_leg",
        "low_voltage",
        "speaker",
        "hdmi",
        "refrigerant",
        "duct_supply",
        "duct_return",
        "pex_loop",
        "pex_supply",
        "pex_return",
      ],
      wall_scope: ["shell", "scenario"],
      wall_state: ["existing", "new"],
    },
  },
} as const
