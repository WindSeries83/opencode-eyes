export type VisionChainOptions = {
  maxCost?: number;
  preferProviders?: string[];
  excludeProviders?: string[];
  excludeModels?: string[];
};

export type VisionModel = {
  providerID: string;
  modelID: string;
  cost: number;
};

export type ProviderListItemModel = {
  id: string;
  attachment: boolean;
  modalities?: {
    input?: string[];
  };
  cost?: {
    input?: number;
  };
  capabilities?: {
    input?: {
      image?: boolean;
    };
  };
};

export type ProviderListItem = {
  id: string;
  models: Record<string, ProviderListItemModel>;
};

export function isVisionModel(model: ProviderListItemModel): boolean {
  if (model.attachment === true) return true;
  if (Array.isArray(model.modalities?.input) && model.modalities.input.includes("image")) return true;
  return model.capabilities?.input?.image === true;
}

export function buildVisionChain(
  all: ProviderListItem[],
  connected: string[],
  options: VisionChainOptions = {},
): VisionModel[] {
  const excludedProviders = new Set(options.excludeProviders ?? []);
  const excludedModels = new Set(options.excludeModels ?? []);
  const preferred = new Set(options.preferProviders ?? []);
  const chain: VisionModel[] = [];

  for (const provider of all) {
    if (!connected.includes(provider.id) || excludedProviders.has(provider.id)) continue;
    for (const [modelID, model] of Object.entries(provider.models)) {
      if (!isVisionModel(model)) continue;
      if (excludedModels.has(modelID) || excludedModels.has(`${provider.id}/${modelID}`)) continue;
      const cost = model.cost?.input ?? 0;
      if (options.maxCost !== undefined && cost > options.maxCost) continue;
      chain.push({ providerID: provider.id, modelID, cost });
    }
  }

  const sortByCost = (a: VisionModel, b: VisionModel) => a.cost - b.cost;
  chain.sort(sortByCost);
  return chain
    .filter((m) => preferred.has(m.providerID))
    .sort(sortByCost)
    .concat(chain.filter((m) => !preferred.has(m.providerID)));
}