import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { confirmWrite, isConfirmWritesEnabled } from "../src/elicitation.js";

describe("isConfirmWritesEnabled", () => {
  afterEach(() => {
    delete process.env.JCM_CONFIRM_WRITES;
  });

  it("returns false when env var is not set", () => {
    delete process.env.JCM_CONFIRM_WRITES;
    expect(isConfirmWritesEnabled()).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    expect(isConfirmWritesEnabled()).toBe(true);
  });

  it("returns false for other values like '1' or 'yes'", () => {
    process.env.JCM_CONFIRM_WRITES = "1";
    expect(isConfirmWritesEnabled()).toBe(false);
    process.env.JCM_CONFIRM_WRITES = "yes";
    expect(isConfirmWritesEnabled()).toBe(false);
    process.env.JCM_CONFIRM_WRITES = "false";
    expect(isConfirmWritesEnabled()).toBe(false);
  });
});

describe("confirmWrite", () => {
  afterEach(() => {
    delete process.env.JCM_CONFIRM_WRITES;
  });

  it("returns confirmed=true when gate is disabled (no env var)", async () => {
    delete process.env.JCM_CONFIRM_WRITES;
    const mockServer = {} as any; // Server not used when gate is off
    const result = await confirmWrite(mockServer, "Test", "Summary");
    expect(result).toEqual({ confirmed: true });
  });

  it("returns confirmed=true when user accepts with confirm=true", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const mockServer = {
      server: {
        elicitInput: vi.fn().mockResolvedValue({
          action: "accept",
          content: { confirm: true },
        }),
      },
    } as any;

    const result = await confirmWrite(mockServer, "Create Issue", "Create Task in PROJ");
    expect(result).toEqual({ confirmed: true });

    // Verify elicitation was called with correct shape
    const call = mockServer.server.elicitInput.mock.calls[0][0];
    expect(call.mode).toBe("form");
    expect(call.message).toContain("Create Issue");
    expect(call.message).toContain("Create Task in PROJ");
    expect(call.requestedSchema.type).toBe("object");
    expect(call.requestedSchema.properties.confirm.type).toBe("boolean");
    expect(call.requestedSchema.required).toContain("confirm");
  });

  it("returns confirmed=false when user declines", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const mockServer = {
      server: {
        elicitInput: vi.fn().mockResolvedValue({
          action: "decline",
        }),
      },
    } as any;

    const result = await confirmWrite(mockServer, "Edit Issue", "Edit TEST-1");
    expect(result).toEqual({ confirmed: false });
  });

  it("returns confirmed=false when user cancels", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const mockServer = {
      server: {
        elicitInput: vi.fn().mockResolvedValue({
          action: "cancel",
        }),
      },
    } as any;

    const result = await confirmWrite(mockServer, "Title", "Summary");
    expect(result).toEqual({ confirmed: false });
  });

  it("returns confirmed=false when user accepts but sets confirm=false", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const mockServer = {
      server: {
        elicitInput: vi.fn().mockResolvedValue({
          action: "accept",
          content: { confirm: false },
        }),
      },
    } as any;

    const result = await confirmWrite(mockServer, "Title", "Summary");
    expect(result).toEqual({ confirmed: false });
  });

  it("returns confirmed=false when elicitation throws (unsupported client)", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const mockServer = {
      server: {
        elicitInput: vi.fn().mockRejectedValue(new Error("elicitation not supported")),
      },
    } as any;

    const result = await confirmWrite(mockServer, "Title", "Summary");
    expect(result).toEqual({ confirmed: false });
  });
});
