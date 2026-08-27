// Thin server-only client for the Waalaxy REST API (https://docs.waalaxy.com).
//
// IMPORTANT: Waalaxy's API is intentionally narrow. As of writing it can:
//   - list campaigns (id + name only, no stats)
//   - list prospect lists
//   - import prospects into a list and enroll them into an EXISTING campaign
// It cannot create a campaign, set/edit the connection-note or follow-up
// message text, launch/pause a campaign, or return performance analytics.
// A human still has to create the campaign and paste the message sequence
// into the Waalaxy UI -- this module only automates the lead-import step
// once that campaign already exists.
//
// Never import this file from client components -- WAALAXY_API_KEY must
// stay server-only.

const WAALAXY_BASE_URL = "https://api.waalaxy.com";

export class WaalaxyNotConfiguredError extends Error {
  constructor() {
    super("Waalaxy integration is not configured. Set WAALAXY_API_KEY in the server environment.");
    this.name = "WaalaxyNotConfiguredError";
  }
}

export class WaalaxyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WaalaxyApiError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.WAALAXY_API_KEY;
  if (!key) throw new WaalaxyNotConfiguredError();
  return key;
}

async function waalaxyRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const apiKey = getApiKey();
  const response = await fetch(`${WAALAXY_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 429) throw new WaalaxyApiError("Waalaxy rate limit reached. Try again shortly.", 429);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new WaalaxyApiError(`Waalaxy API error (${response.status}): ${text || response.statusText}`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function testWaalaxyConnection(): Promise<boolean> {
  return waalaxyRequest<boolean>("/integrations/test");
}

export type WaalaxyCampaign = { _id: string; name: string };
export async function listWaalaxyCampaigns(): Promise<WaalaxyCampaign[]> {
  const data = await waalaxyRequest<{ total: number; campaigns: WaalaxyCampaign[] }>("/campaigns/getAll");
  return data.campaigns || [];
}

export type WaalaxyProspectList = { _id: string; name: string };
export async function listWaalaxyProspectLists(): Promise<WaalaxyProspectList[]> {
  const data = await waalaxyRequest<{ prospectLists: WaalaxyProspectList[] }>("/prospectLists/getProspectLists");
  return data.prospectLists || [];
}

export type WaalaxyProspectInput = {
  url: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  customVariables?: { label: string; value: string }[];
};

export type WaalaxyImportResult = {
  importCode: string;
  addToCampaignCode?: string;
  prospect?: { _id: string; profile?: { firstName?: string; lastName?: string; publicIdentifier?: string } };
};

export async function pushProspectsToWaalaxy(params: { prospectListId: string; campaignId: string; prospects: WaalaxyProspectInput[] }): Promise<WaalaxyImportResult[]> {
  const body = {
    prospects: params.prospects.map((p) => ({
      url: p.url,
      customProfile: { firstName: p.firstName || "", lastName: p.lastName || "", email: p.email || "" },
      customVariables: p.customVariables || [],
    })),
    prospectListId: params.prospectListId,
    campaignId: params.campaignId,
    origin: { name: "myntmore-outreach" },
    canCreateDuplicates: false,
    moveDuplicatesToOtherList: false,
    shouldOverwriteCustomProfileData: false,
    addExistingProspectInCampaign: true,
  };
  const data = await waalaxyRequest<{ result: WaalaxyImportResult[] }>("/prospects/addProspectFromIntegration", { method: "POST", body });
  return data.result || [];
}
