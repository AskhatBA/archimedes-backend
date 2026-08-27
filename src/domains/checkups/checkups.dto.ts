export type CheckupCoverageValue = 'PERSONAL' | 'FAMILY';

/**
 * One catalogue entry as the mobile app consumes it. Mirrors the shape of the MIS
 * `PayProgramItem` where it can, so both tabs of the paid-programs screen map onto
 * the same client-side model.
 */
export interface CheckupItem {
  id: string;
  code: string;
  title: string;
  description: string | null;
  /** Price in tenge. */
  price: number;
  duration: string | null;
  coverage: CheckupCoverageValue;
  services: string[];
  popular: boolean;
}

/**
 * What the dashboard sees: the same entry plus the bookkeeping the app has no use for.
 * Unpublished (`isActive: false`) rows exist only in this view.
 */
export interface CheckupAdminItem extends CheckupItem {
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCheckupBody {
  code: string;
  title: string;
  price: number;
  services: string[];
  description?: string | null;
  duration?: string | null;
  coverage?: CheckupCoverageValue;
  popular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** Every field is optional — the dashboard sends only what the admin actually changed. */
export type UpdateCheckupBody = Partial<CreateCheckupBody>;
