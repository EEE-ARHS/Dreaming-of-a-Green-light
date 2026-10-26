import manifest from "./manifest.json";

export interface ModelOverride {
  path: string | null;
  fit: {
    targetSize: number[] | "belonging";
    alignBottom: boolean;
  };
}

const models = manifest.models as unknown as {
  house: ModelOverride;
  car: ModelOverride;
  belongings: Record<string, ModelOverride>;
};

export const HOUSE_MODEL_OVERRIDE = models.house as ModelOverride & { fit: { targetSize: [number, number, number]; alignBottom: boolean } };
export const CAR_MODEL_OVERRIDE = models.car as ModelOverride & { fit: { targetSize: [number, number, number]; alignBottom: boolean } };
export const BELONGING_MODEL_OVERRIDES = models.belongings;
