import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";
import { handleAddToActiveSprint } from "../../src/tools/add-to-active-sprint.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

describe("jcm_addToActiveSprint", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  const posts = () => fetchSpy.mock.calls.filter(([, o]) => o?.method === "POST");

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips when the issue is already in an active sprint", async () => {
    fetchSpy.mockResolvedValueOnce(json({ fields: { sprint: { id: 7, name: "S7", state: "active" } } }));

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1" }));

    expect(result).toEqual({ ok: true, skipped: "already-in-sprint", sprint: { id: 7, name: "S7" } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("/rest/agile/1.0/issue/TEST-1");
    expect(posts()).toHaveLength(0);
  });

  it("skips when the project has no scrum board", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: { sprint: null } }))
      .mockResolvedValueOnce(json({ values: [] }));

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1" }));

    expect(result).toEqual({ ok: true, skipped: "no-scrum-board" });
    const url = fetchSpy.mock.calls[1][0];
    expect(url).toContain("/rest/agile/1.0/board");
    expect(url).toContain("projectKeyOrId=TEST");
    expect(url).toContain("type=scrum");
    expect(posts()).toHaveLength(0);
  });

  it("returns candidates when there are multiple scrum boards", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: {} }))
      .mockResolvedValueOnce(json({ values: [{ id: 1, name: "A", type: "scrum" }, { id: 2, name: "B" }] }));

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1" }));

    expect(result).toEqual({
      ok: false,
      reason: "multiple-scrum-boards",
      candidates: [{ id: 1, name: "A" }, { id: 2, name: "B" }],
    });
    expect(posts()).toHaveLength(0);
  });

  it("returns no-active-sprint with empty candidates", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: { sprint: { id: 3, name: "Future", state: "future" } } }))
      .mockResolvedValueOnce(json({ values: [] }));

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1", boardId: 5 }));

    expect(result).toEqual({ ok: false, reason: "no-active-sprint", candidates: [] });
    expect(fetchSpy.mock.calls[1][0]).toContain("/rest/agile/1.0/board/5/sprint");
    expect(fetchSpy.mock.calls[1][0]).toContain("state=active");
    expect(posts()).toHaveLength(0);
  });

  it("returns candidates when there are multiple active sprints", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: {} }))
      .mockResolvedValueOnce(json({ values: [{ id: 10, name: "S10" }, { id: 11, name: "S11" }] }));

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1", boardId: 5 }));

    expect(result).toEqual({
      ok: false,
      reason: "multiple-active-sprints",
      candidates: [{ id: 10, name: "S10" }, { id: 11, name: "S11" }],
    });
    expect(posts()).toHaveLength(0);
  });

  it("adds the issue to the single active sprint of the discovered board", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: {} }))
      .mockResolvedValueOnce(json({ values: [{ id: 4, name: "Board" }] }))
      .mockResolvedValueOnce(json({ values: [{ id: 42, name: "Sprint 42" }] }))
      .mockResolvedValueOnce({ ok: true, status: 204 });

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1" }));

    expect(result).toEqual({ ok: true, key: "TEST-1", sprintId: 42, sprintName: "Sprint 42", boardId: 4 });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const [url, opts] = fetchSpy.mock.calls[3];
    expect(url).toContain("/rest/agile/1.0/sprint/42/issue");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ issues: ["TEST-1"] });
  });

  it("does not POST when the user declines confirmation", async () => {
    vi.stubEnv("JCM_CONFIRM_WRITES", "true");
    const server = { server: { elicitInput: vi.fn().mockResolvedValue({ action: "decline" }) } };
    fetchSpy
      .mockResolvedValueOnce(json({ fields: {} }))
      .mockResolvedValueOnce(json({ values: [{ id: 42, name: "Sprint 42" }] }));

    const result = JSON.parse(
      await handleAddToActiveSprint(client, { issueKey: "TEST-1", boardId: 9 }, server as never)
    );

    vi.unstubAllEnvs();
    expect(result).toMatchObject({ ok: false, key: "TEST-1" });
    expect(server.server.elicitInput).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
  });

  it("uses the explicit boardId without listing boards", async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ fields: {} }))
      .mockResolvedValueOnce(json({ values: [{ id: 42, name: "Sprint 42" }] }))
      .mockResolvedValueOnce({ ok: true, status: 204 });

    const result = JSON.parse(await handleAddToActiveSprint(client, { issueKey: "TEST-1", boardId: 9 }));

    expect(result).toMatchObject({ ok: true, sprintId: 42, boardId: 9 });
    expect(fetchSpy.mock.calls[1][0]).toContain("/rest/agile/1.0/board/9/sprint");
  });
});
