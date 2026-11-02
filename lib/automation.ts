// Thin server-only client for the automation tool REST API (https://docs.automation.com).
//
// IMPORTANT: the automation tool's API is intentionally narrow. As of writing it can:
//   - list campaigns (id + name only, no stats)
//   - list prospect lists
//   - import prospects into a list and enroll them into an EXISTING campaign
// It cannot create a campaign, set/edit the connection-note or follow-up
// message text, launch/pause a campaign, or return performance analytics.
// A human still has to create the campaign and paste the message sequence
// into the automation tool UI -- this module only automates the lead-import step
// once that campaign already exists.
//
// Never import this file from client components -- AUTOMATION_API_KEY must
// stay server-only.

const AUTOMATION_BASE_URL = "https://api.waalaxy.com";

export class AutomationNotConfiguredError extends Error {
  constructor() {
    super("the automation tool integration is not configured. Set AUTOMATION_API_KEY in the server environment.");
    this.name = "AutomationNotConfiguredError";
  }
}

export class AutomationApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AutomationApiError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.AUTOMATION_API_KEY;
  if (!key) throw new AutomationNotConfiguredError();
  return key;
}

async function automationRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const apiKey = getApiKey();
  const response = await fetch(`${AUTOMATION_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 429) throw new AutomationApiError("the automation tool rate limit reached. Try again shortly.", 429);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AutomationApiError(`the automation tool API error (${response.status}): ${text || response.statusText}`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function testAutomationConnection(): Promise<boolean> {
  return automationRequest<boolean>("/integrations/test");
}

export type AutomationCampaign = { _id: string; name: string };
export async function listAutomationCampaigns(): Promise<AutomationCampaign[]> {
  const data = await automationRequest<{ total: number; campaigns: AutomationCampaign[] }>("/campaigns/getAll");
  return data.campaigns || [];
}

export type AutomationProspectList = { _id: string; name: string };
export async function listAutomationProspectLists(): Promise<AutomationProspectList[]> {
  const data = await automationRequest<{ prospectLists: AutomationProspectList[] }>("/prospectLists/getProspectLists");
  return data.prospectLists || [];
}

export type AutomationProspectInput = {
  url: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  customVariables?: { label: string; value: string }[];
};

export type AutomationImportResult = {
  importCode: string;
  addToCampaignCode?: string;
  prospect?: { _id: string; profile?: { firstName?: string; lastName?: string; publicIdentifier?: string } };
};

export async function pushProspectsToAutomation(params: { prospectListId: string; campaignId: string; prospects: AutomationProspectInput[] }): Promise<AutomationImportResult[]> {
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
  const data = await automationRequest<{ result: AutomationImportResult[] }>("/prospects/addProspectFromIntegration", { method: "POST", body });
  return data.result || [];
}
