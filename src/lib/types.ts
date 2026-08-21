export type UserRole = "customer" | "captain" | "admin";

export type TripStatus =
  | "pending"
  | "accepted"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export type TripKind = "in_city" | "intercity";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  price_per_km_in_city: number;
  price_per_km_intercity: number;
  min_fare: number;
  service_fee_percent: number;
  dispatch_radius_km: number;
  dispatch_timeout_sec: number;
  tracking_interval_sec: number;
  offer_ttl_sec: number;
  arrival_radius_m: number;
}
