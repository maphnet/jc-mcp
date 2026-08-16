import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

function mockGetResponse(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      fields: {
        issuetype: { name: "Task" },
        parent: undefined,
        ...overrides,
      },
    }),
  };
}

function mockPutResponse() {
  return { ok: true, status: 204 };
}

describe("jcm_convertIssueType", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts task to sub-task (set type then parent)", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockGetResponse()) // GET current state
      .mockResolvedValueOnce(mockPutResponse()) // PUT issuetype
      .mockResolvedValueOnce(mockPutResponse()); // PUT parent

    const { handleConvertIssueType } = await import(
      "../../src/tools/convert-issue-type.js"
    );
    const result = JSON.parse(
      await handleConvertIssueType(client, {
        issueKey: "PROJ-1",
        issueTypeName: "Sub-task",
        parentKey: "PROJ-2",
      })
    );

    expect(result).toEqual({
      ok: true,
      key: "PROJ-1",
      issueType: "Sub-task",
      parentKey: "PROJ-2",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("[CR-3] rejects cross-project parent before any mutation", async () => {
    fetchSpy.mockResolvedValueOnce(mockGetResponse()); // GET current state

    const { handleConvertIssueType } = await import(
      "../../src/tools/convert-issue-type.js"
    );
    await expect(
      handleConvertIssueType(client, {
        issueKey: "PROJ-1",
        issueTypeName: "Sub-task",
        parentKey: "OTHER-2",
      })
    ).rejects.toThrow(
      "Parent issue must be in the same project as the issue being converted."
    );

    // Only the initial GET should have been called -- no mutations
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("[CR-2] skips parent-clearing PUT when issue already has no parent", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockGetResponse()) // GET: no parent
      .mockResolvedValueOnce(mockPutResponse()); // PUT issuetype only

    const { handleConvertIssueType } = await import(
      "../../src/tools/convert-issue-type.js"
    );
    const result = JSON.parse(
      await handleConvertIssueType(client, {
        issueKey: "PROJ-1",
        issueTypeName: "Task",
      })
    );

    expect(result.ok).toBe(true);
    // Should be 2 calls: GET + 1 PUT (issuetype only), NOT 3
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCall = fetchSpy.mock.calls[1];
    const body = JSON.parse(secondCall[1].body);
    expect(body.fields).toHaveProperty("issuetype");
    expect(body.fields).not.toHaveProperty("parent");
  });

  it("clears parent when sub-task has a parent", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        mockGetResponse({
          issuetype: { name: "Sub-task" },
          parent: { key: "PROJ-10" },
        })
      ) // GET: has parent
      .mockResolvedValueOnce(mockPutResponse()) // PUT parent: null
      .mockResolvedValueOnce(mockPutResponse()); // PUT issuetype

    const { handleConvertIssueType } = await import(
      "../../src/tools/convert-issue-type.js"
    );
    const result = JSON.parse(
      await handleConvertIssueType(client, {
        issueKey: "PROJ-1",
        issueTypeName: "Task",
      })
    );

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // First PUT clears parent
    const firstPutBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(firstPutBody.fields.parent).toBeNull();

    // Second PUT sets issuetype
    const secondPutBody = JSON.parse(fetchSpy.mock.calls[2][1].body);
    expect(secondPutBody.fields.issuetype.name).toBe("Task");
  });

  it("[CR-4] rollback restores both parent and issuetype on failure", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        mockGetResponse({
          issuetype: { name: "Sub-task" },
          parent: { key: "PROJ-10" },
        })
      ) // GET
      .mockResolvedValueOnce(mockPutResponse()) // PUT parent: null (success)
      .mockResolvedValueOnce(
        Promise.reject(new Error("issuetype change failed"))
      ) // PUT issuetype (fail)
      .mockResolvedValueOnce(mockPutResponse()) // rollback: restore parent
      .mockResolvedValueOnce(mockPutResponse()); // rollback: restore issuetype

    const { handleConvertIssueType } = await import(
      "../../src/tools/convert-issue-type.js"
    );
    await expect(
      handleConvertIssueType(client, {
        issueKey: "PROJ-1",
        issueTypeName: "Task",
      })
    ).rejects.toThrow("issuetype change failed");

    // 5 calls: GET + clear parent + fail issuetype + rollback parent + rollback issuetype
    expect(fetchSpy).toHaveBeenCalledTimes(5);

    // Rollback parent
    const rollbackParentBody = JSON.parse(fetchSpy.mock.calls[3][1].body);
    expect(rollbackParentBody.fields.parent.key).toBe("PROJ-10");

    // Rollback issuetype
    const rollbackTypeBody = JSON.parse(fetchSpy.mock.calls[4][1].body);
    expect(rollbackTypeBody.fields.issuetype.name).toBe("Sub-task");
  });
});
