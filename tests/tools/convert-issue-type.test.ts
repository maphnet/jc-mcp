import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";
import { handleConvertIssueType } from "../../src/tools/convert-issue-type.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

const project = json({
  issueTypes: [
    { id: "10043", name: "Subtask" },
    { id: "10045", name: "Task" },
  ],
});

describe("jcm_convertIssueType", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  // Fake timers make the 1s poll interval instant.
  const run = async (params: Parameters<typeof handleConvertIssueType>[1]) => {
    const p = handleConvertIssueType(client, params);
    p.catch(() => {});
    await vi.runAllTimersAsync();
    return p.then((r) => JSON.parse(r));
  };
  const moveBody = () => JSON.parse(fetchSpy.mock.calls[1][1].body);

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("converts tasks to sub-tasks under a parent via bulk move", async () => {
    fetchSpy
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(json({ taskId: "77" }, 201))
      .mockResolvedValueOnce(json({ status: "RUNNING" }))
      .mockResolvedValueOnce(json({ status: "COMPLETE", failedAccessibleIssues: {}, invalidOrInaccessibleIssueCount: 0 }));

    const result = await run({ issueKeys: ["PROJ-2", "PROJ-3"], issueTypeName: "subtask", parentKey: "PROJ-1" });

    expect(result).toEqual({ ok: true, keys: ["PROJ-2", "PROJ-3"], issueType: "Subtask", parentKey: "PROJ-1" });
    expect(fetchSpy.mock.calls[0][0]).toContain("/rest/api/3/project/PROJ");
    expect(fetchSpy.mock.calls[1][0]).toContain("/rest/api/3/bulk/issues/move");
    expect(moveBody().targetToSourcesMapping).toEqual({
      "PROJ,10043,PROJ-1": expect.objectContaining({ issueIdsOrKeys: ["PROJ-2", "PROJ-3"] }),
    });
    expect(fetchSpy.mock.calls[3][0]).toContain("/rest/api/3/bulk/queue/77");
  });

  it("converts a sub-task to a standalone task (no parent in mapping key)", async () => {
    fetchSpy
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(json({ taskId: "78" }, 201))
      .mockResolvedValueOnce(json({ status: "COMPLETE" }));

    const result = await run({ issueKeys: ["PROJ-2"], issueTypeName: "Task" });

    expect(result).toEqual({ ok: true, keys: ["PROJ-2"], issueType: "Task", parentKey: null });
    expect(Object.keys(moveBody().targetToSourcesMapping)).toEqual(["PROJ,10045"]);
  });

  it("reports per-issue failures from the bulk task", async () => {
    fetchSpy
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(json({ taskId: "79" }, 201))
      .mockResolvedValueOnce(json({ status: "COMPLETE", failedAccessibleIssues: { "10415": ["nope"] } }));

    const result = await run({ issueKeys: ["PROJ-2"], issueTypeName: "Task" });

    expect(result).toEqual({ ok: false, taskId: "79", status: "COMPLETE", failed: { "10415": ["nope"] } });
  });

  it("returns the taskId when the move is still running after the timeout", async () => {
    fetchSpy
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(json({ taskId: "80" }, 201))
      .mockResolvedValue(json({ status: "RUNNING" }));

    const result = await run({ issueKeys: ["PROJ-2"], issueTypeName: "Task" });

    expect(result).toEqual({
      ok: false,
      taskId: "80",
      status: "RUNNING",
      message: "Move still running in Jira; confirm the new type with jcm_getIssue.",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2 + 30);
  });

  it("rejects an unknown issue type before any write", async () => {
    fetchSpy.mockResolvedValueOnce(project);

    await expect(run({ issueKeys: ["PROJ-2"], issueTypeName: "Epic" })).rejects.toThrow(
      'Issue type "Epic" not found in PROJ. Available: Subtask, Task'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects issues or parent from another project without calling Jira", async () => {
    await expect(run({ issueKeys: ["PROJ-2"], issueTypeName: "Subtask", parentKey: "OTHER-1" })).rejects.toThrow(
      "same project"
    );
    await expect(run({ issueKeys: ["PROJ-2", "OTHER-3"], issueTypeName: "Task" })).rejects.toThrow("same project");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces Jira validation errors from the move request", async () => {
    fetchSpy
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(
        json({ errors: [{ message: "Target parent provided should be on a higher level than the target issue type." }] }, 400)
      );

    await expect(run({ issueKeys: ["PROJ-2"], issueTypeName: "Subtask", parentKey: "PROJ-3" })).rejects.toThrow(
      "Jira API error 400"
    );
  });
});
