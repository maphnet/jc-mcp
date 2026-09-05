import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

function makeMockServer(action: "accept" | "decline" | "cancel" = "accept") {
  return {
    server: {
      elicitInput: vi.fn().mockResolvedValue({
        action,
        content: action === "accept" ? { confirm: true } : undefined,
      }),
    },
  } as any;
}

describe("elicitation gate integration", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.JCM_CONFIRM_WRITES;
  });

  describe("jcm_createIssue", () => {
    it("proceeds without elicitation when JCM_CONFIRM_WRITES is not set", async () => {
      delete process.env.JCM_CONFIRM_WRITES;
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "1", key: "TEST-1", self: "..." }),
      });

      const { handleCreateIssue } = await import("../../src/tools/create-issue.js");
      const result = await handleCreateIssue(client, {
        projectKey: "TEST",
        issueType: "Task",
        summary: "Test",
      });

      expect(JSON.parse(result).key).toBe("TEST-1");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("blocks write when user declines", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("decline");

      const { handleCreateIssue } = await import("../../src/tools/create-issue.js");
      const result = await handleCreateIssue(client, {
        projectKey: "TEST",
        issueType: "Task",
        summary: "Test",
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("allows write when user accepts", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("accept");
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "2", key: "TEST-2", self: "..." }),
      });

      const { handleCreateIssue } = await import("../../src/tools/create-issue.js");
      const result = await handleCreateIssue(client, {
        projectKey: "TEST",
        issueType: "Task",
        summary: "Accepted task",
      }, server);

      expect(JSON.parse(result).key).toBe("TEST-2");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("jcm_editIssue", () => {
    it("blocks write when user declines", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("decline");

      const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
      const result = await handleEditIssue(client, {
        issueKey: "TEST-1",
        fields: { summary: "New title" },
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("jcm_transitionIssue", () => {
    it("blocks write when user cancels", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("cancel");

      const { handleTransitionIssue } = await import("../../src/tools/transition-issue.js");
      const result = await handleTransitionIssue(client, {
        issueKey: "TEST-1",
        transitionId: "31",
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("jcm_addComment", () => {
    it("blocks write when user declines", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("decline");

      const { handleAddComment } = await import("../../src/tools/add-comment.js");
      const result = await handleAddComment(client, {
        issueKey: "TEST-1",
        body: "This is a comment",
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("jcm_createArticle", () => {
    it("blocks write when user declines", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("decline");

      const { handleCreateArticle } = await import("../../src/tools/create-article.js");
      const result = await handleCreateArticle(client, {
        spaceId: "123",
        title: "Test Page",
        body: "Content here",
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("jcm_updateArticle", () => {
    it("blocks write when user declines", async () => {
      process.env.JCM_CONFIRM_WRITES = "true";
      const server = makeMockServer("decline");

      const { handleUpdateArticle } = await import("../../src/tools/update-article.js");
      const result = await handleUpdateArticle(client, {
        pageId: "456",
        title: "Updated Page",
        body: "New content",
        version: 3,
      }, server);

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toContain("declined");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
