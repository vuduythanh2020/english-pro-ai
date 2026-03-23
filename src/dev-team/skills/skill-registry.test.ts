/**
 * Unit Tests for SkillRegistry
 * ============================================================================
 * Tests cover:
 * - register / unregister / clear
 * - selectSkills (role filtering, activation logic, priority sorting)
 * - buildPrompt (fragment composition, token estimation)
 * - Edge cases (empty registry, unknown skill overrides, empty fragments)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SkillRegistry, resetDefaultRegistry, getDefaultRegistry } from "./index.js";
import type { AgentSkill, SkillSelectionContext } from "./types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/** Helper: tạo SkillSelectionContext mặc định cho Dev Agent round 0 */
function makeContext(overrides: Partial<SkillSelectionContext> = {}): SkillSelectionContext {
    return {
        agentRole: "dev",
        currentRound: 0,
        maxRounds: 15,
        hasError: false,
        hasFeedback: false,
        hasWrittenFiles: false,
        writtenFiles: [],
        ...overrides,
    };
}

/** Helper: tạo stub AgentSkill */
function makeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
    return {
        name: "test-skill",
        description: "A test skill",
        applicableRoles: ["dev", "tester"],
        priority: 50,
        shouldActivate: () => true,
        getPromptFragment: () => "Test fragment content",
        ...overrides,
    };
}

// ============================================================================
// Tests: Registration
// ============================================================================

describe("SkillRegistry — Registration", () => {
    let registry: SkillRegistry;

    beforeEach(() => {
        registry = new SkillRegistry();
    });

    it("should register a skill and retrieve it by name", () => {
        const skill = makeSkill({ name: "my-skill" });
        registry.register(skill);

        expect(registry.get("my-skill")).toBe(skill);
        expect(registry.size).toBe(1);
    });

    it("should register multiple skills via registerAll", () => {
        const skills = [
            makeSkill({ name: "skill-a" }),
            makeSkill({ name: "skill-b" }),
            makeSkill({ name: "skill-c" }),
        ];
        registry.registerAll(skills);

        expect(registry.size).toBe(3);
        expect(registry.get("skill-a")).toBeDefined();
        expect(registry.get("skill-b")).toBeDefined();
        expect(registry.get("skill-c")).toBeDefined();
    });

    it("should overwrite existing skill with same name", () => {
        const skill1 = makeSkill({ name: "dup", description: "version 1" });
        const skill2 = makeSkill({ name: "dup", description: "version 2" });

        registry.register(skill1);
        registry.register(skill2);

        expect(registry.size).toBe(1);
        expect(registry.get("dup")?.description).toBe("version 2");
    });

    it("should return undefined for unknown skill", () => {
        expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should unregister a skill", () => {
        registry.register(makeSkill({ name: "to-remove" }));
        expect(registry.size).toBe(1);

        const removed = registry.unregister("to-remove");
        expect(removed).toBe(true);
        expect(registry.size).toBe(0);
        expect(registry.get("to-remove")).toBeUndefined();
    });

    it("should return false when unregistering nonexistent skill", () => {
        expect(registry.unregister("nope")).toBe(false);
    });

    it("should clear all skills", () => {
        registry.registerAll([
            makeSkill({ name: "a" }),
            makeSkill({ name: "b" }),
        ]);
        expect(registry.size).toBe(2);

        registry.clear();
        expect(registry.size).toBe(0);
    });

    it("should return all skills via getAll", () => {
        registry.registerAll([
            makeSkill({ name: "x" }),
            makeSkill({ name: "y" }),
        ]);

        const all = registry.getAll();
        expect(all).toHaveLength(2);
        expect(all.map((s) => s.name)).toContain("x");
        expect(all.map((s) => s.name)).toContain("y");
    });
});

// ============================================================================
// Tests: selectSkills
// ============================================================================

describe("SkillRegistry — selectSkills", () => {
    let registry: SkillRegistry;

    beforeEach(() => {
        registry = new SkillRegistry();
    });

    it("should return empty array when no skills registered", () => {
        const result = registry.selectSkills(makeContext());
        expect(result).toEqual([]);
    });

    it("should filter by applicableRoles", () => {
        registry.register(makeSkill({
            name: "dev-only",
            applicableRoles: ["dev"],
            shouldActivate: () => true,
        }));
        registry.register(makeSkill({
            name: "tester-only",
            applicableRoles: ["tester"],
            shouldActivate: () => true,
        }));

        const devResult = registry.selectSkills(makeContext({ agentRole: "dev" }));
        expect(devResult).toContain("dev-only");
        expect(devResult).not.toContain("tester-only");

        const testerResult = registry.selectSkills(makeContext({ agentRole: "tester" }));
        expect(testerResult).toContain("tester-only");
        expect(testerResult).not.toContain("dev-only");
    });

    it("should respect shouldActivate condition", () => {
        registry.register(makeSkill({
            name: "always-on",
            shouldActivate: () => true,
        }));
        registry.register(makeSkill({
            name: "always-off",
            shouldActivate: () => false,
        }));

        const result = registry.selectSkills(makeContext());
        expect(result).toContain("always-on");
        expect(result).not.toContain("always-off");
    });

    it("should pass context to shouldActivate", () => {
        registry.register(makeSkill({
            name: "error-only",
            shouldActivate: (ctx) => ctx.hasError,
        }));

        const noError = registry.selectSkills(makeContext({ hasError: false }));
        expect(noError).not.toContain("error-only");

        const withError = registry.selectSkills(makeContext({ hasError: true }));
        expect(withError).toContain("error-only");
    });

    it("should sort by priority (ascending)", () => {
        registry.register(makeSkill({ name: "low-priority", priority: 90 }));
        registry.register(makeSkill({ name: "high-priority", priority: 10 }));
        registry.register(makeSkill({ name: "mid-priority", priority: 50 }));

        const result = registry.selectSkills(makeContext());
        expect(result).toEqual(["high-priority", "mid-priority", "low-priority"]);
    });

    it("should handle shared skills (both roles)", () => {
        registry.register(makeSkill({
            name: "shared-skill",
            applicableRoles: ["dev", "tester"],
        }));

        const devResult = registry.selectSkills(makeContext({ agentRole: "dev" }));
        expect(devResult).toContain("shared-skill");

        const testerResult = registry.selectSkills(makeContext({ agentRole: "tester" }));
        expect(testerResult).toContain("shared-skill");
    });
});

// ============================================================================
// Tests: buildPrompt
// ============================================================================

describe("SkillRegistry — buildPrompt", () => {
    let registry: SkillRegistry;

    beforeEach(() => {
        registry = new SkillRegistry();
    });

    it("should return basePrompt only when no skills activate", () => {
        const result = registry.buildPrompt({
            basePrompt: "Base prompt here",
            context: makeContext(),
        });

        expect(result.prompt).toBe("Base prompt here");
        expect(result.activeSkillNames).toEqual([]);
        expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    it("should compose basePrompt + skill fragments", () => {
        registry.register(makeSkill({
            name: "skill-a",
            priority: 10,
            getPromptFragment: () => "Fragment A content",
        }));
        registry.register(makeSkill({
            name: "skill-b",
            priority: 20,
            getPromptFragment: () => "Fragment B content",
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base prompt",
            context: makeContext(),
        });

        // Should contain base prompt
        expect(result.prompt).toContain("Base prompt");

        // Should contain both fragments
        expect(result.prompt).toContain("Fragment A content");
        expect(result.prompt).toContain("Fragment B content");

        // Should have section headers
        expect(result.prompt).toContain("SKILL: SKILL-A");
        expect(result.prompt).toContain("SKILL: SKILL-B");

        // Should have ACTIVE SKILLS header
        expect(result.prompt).toContain("ACTIVE SKILLS (2)");

        // Should list active skill names
        expect(result.activeSkillNames).toEqual(["skill-a", "skill-b"]);
    });

    it("should order fragments by priority in output", () => {
        registry.register(makeSkill({
            name: "second",
            priority: 20,
            getPromptFragment: () => "SECOND_MARKER",
        }));
        registry.register(makeSkill({
            name: "first",
            priority: 10,
            getPromptFragment: () => "FIRST_MARKER",
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base",
            context: makeContext(),
        });

        const firstIdx = result.prompt.indexOf("FIRST_MARKER");
        const secondIdx = result.prompt.indexOf("SECOND_MARKER");
        expect(firstIdx).toBeLessThan(secondIdx);
    });

    it("should support skillOverrides to force specific skills", () => {
        registry.register(makeSkill({
            name: "auto-selected",
            shouldActivate: () => true,
            getPromptFragment: () => "AUTO_CONTENT",
        }));
        registry.register(makeSkill({
            name: "manual-only",
            shouldActivate: () => false, // Normally wouldn't activate
            getPromptFragment: () => "MANUAL_CONTENT",
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base",
            context: makeContext(),
            skillOverrides: ["manual-only"],
        });

        // Should include manual-only (via override), NOT auto-selected
        expect(result.prompt).toContain("MANUAL_CONTENT");
        expect(result.prompt).not.toContain("AUTO_CONTENT");
        expect(result.activeSkillNames).toEqual(["manual-only"]);
    });

    it("should skip unknown skills in overrides gracefully", () => {
        registry.register(makeSkill({
            name: "real-skill",
            getPromptFragment: () => "REAL_CONTENT",
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base",
            context: makeContext(),
            skillOverrides: ["real-skill", "nonexistent-skill"],
        });

        expect(result.prompt).toContain("REAL_CONTENT");
        expect(result.activeSkillNames).toEqual(["real-skill"]);
    });

    it("should skip skills with empty fragments", () => {
        registry.register(makeSkill({
            name: "empty-skill",
            getPromptFragment: () => "   ", // Only whitespace
        }));
        registry.register(makeSkill({
            name: "real-skill",
            getPromptFragment: () => "Real content",
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base",
            context: makeContext(),
        });

        expect(result.activeSkillNames).toEqual(["real-skill"]);
        expect(result.prompt).not.toContain("EMPTY-SKILL");
    });

    it("should estimate tokens correctly (~3 chars per token)", () => {
        const result = registry.buildPrompt({
            basePrompt: "x".repeat(300), // 300 chars → ~100 tokens
            context: makeContext(),
        });

        expect(result.estimatedTokens).toBe(100);
    });

    it("should pass context to getPromptFragment for dynamic skills", () => {
        registry.register(makeSkill({
            name: "dynamic-skill",
            getPromptFragment: (ctx) => {
                return `Files: ${ctx?.writtenFiles.join(", ") || "none"}`;
            },
        }));

        const result = registry.buildPrompt({
            basePrompt: "Base",
            context: makeContext({ writtenFiles: ["a.ts", "b.ts"] }),
        });

        expect(result.prompt).toContain("Files: a.ts, b.ts");
    });
});

// ============================================================================
// Tests: Singleton
// ============================================================================

describe("SkillRegistry — Singleton", () => {
    beforeEach(() => {
        resetDefaultRegistry();
    });

    it("should return same instance on multiple calls", () => {
        const a = getDefaultRegistry();
        const b = getDefaultRegistry();
        expect(a).toBe(b);
    });

    it("should return new instance after reset", () => {
        const a = getDefaultRegistry();
        a.register(makeSkill({ name: "temp" }));

        resetDefaultRegistry();
        const b = getDefaultRegistry();

        expect(b).not.toBe(a);
        expect(b.size).toBe(0);
    });
});

// ============================================================================
// Tests: Integration with real skills
// ============================================================================

describe("SkillRegistry — Integration with real skills", () => {
    // Dynamic imports to test real skill files
    let registry: SkillRegistry;

    beforeEach(async () => {
        registry = new SkillRegistry();

        const { exploreCodebaseSkill } = await import("./explore-codebase.skill.js");
        const { writeTypescriptSkill } = await import("./write-typescript.skill.js");
        const { errorFixLoopSkill } = await import("./error-fix-loop.skill.js");
        const { verifySubmitSkill } = await import("./verify-submit.skill.js");
        const { revisionFeedbackSkill } = await import("./revision-feedback.skill.js");
        const { writeTestsSkill } = await import("./write-tests.skill.js");

        registry.registerAll([
            exploreCodebaseSkill,
            writeTypescriptSkill,
            errorFixLoopSkill,
            verifySubmitSkill,
            revisionFeedbackSkill,
            writeTestsSkill,
        ]);
    });

    it("should have 6 skills registered", () => {
        expect(registry.size).toBe(6);
    });

    it("Dev Agent round 0: should activate explore-codebase only", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "dev",
            currentRound: 0,
            hasError: false,
            hasFeedback: false,
            hasWrittenFiles: false,
        }));

        expect(selected).toContain("explore-codebase");
        expect(selected).not.toContain("write-typescript");
        expect(selected).not.toContain("error-fix-loop");
        expect(selected).not.toContain("verify-submit");
        expect(selected).not.toContain("write-tests");
    });

    it("Dev Agent round 3: should activate explore-codebase + write-typescript (no files written yet)", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "dev",
            currentRound: 2,
            hasWrittenFiles: false,
        }));

        expect(selected).toContain("explore-codebase");
        expect(selected).toContain("write-typescript");
    });

    it("Dev Agent round 5 with error: should activate error-fix-loop", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "dev",
            currentRound: 5,
            hasError: true,
            hasWrittenFiles: true,
            writtenFiles: ["src/foo.ts"],
        }));

        expect(selected).toContain("error-fix-loop");
        // write-typescript should NOT activate when hasError
        expect(selected).not.toContain("write-typescript");
    });

    it("Dev Agent round 7 with written files: should activate verify-submit", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "dev",
            currentRound: 7,
            hasWrittenFiles: true,
            hasError: false,
        }));

        expect(selected).toContain("verify-submit");
        expect(selected).toContain("write-typescript");
    });

    it("Dev Agent with feedback: should activate revision-feedback", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "dev",
            currentRound: 0,
            hasFeedback: true,
        }));

        expect(selected).toContain("revision-feedback");
    });

    it("Tester Agent round 0: should activate explore-codebase only", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "tester",
            currentRound: 0,
        }));

        expect(selected).toContain("explore-codebase");
        expect(selected).not.toContain("write-tests");
        expect(selected).not.toContain("write-typescript"); // Dev only
        expect(selected).not.toContain("revision-feedback"); // Dev only
    });

    it("Tester Agent round 3: should activate write-tests", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "tester",
            currentRound: 3,
            hasWrittenFiles: false,
        }));

        expect(selected).toContain("write-tests");
    });

    it("Tester Agent with error: should activate error-fix-loop", () => {
        const selected = registry.selectSkills(makeContext({
            agentRole: "tester",
            currentRound: 5,
            hasError: true,
            hasWrittenFiles: true,
        }));

        expect(selected).toContain("error-fix-loop");
    });

    it("buildPrompt should produce valid prompt with dynamic context", () => {
        const result = registry.buildPrompt({
            basePrompt: "You are a Dev Agent.",
            context: makeContext({
                agentRole: "dev",
                currentRound: 5,
                hasError: true,
                hasWrittenFiles: true,
                writtenFiles: ["src/my-file.ts"],
            }),
        });

        // Should include error-fix-loop with dynamic written files
        expect(result.prompt).toContain("src/my-file.ts");
        expect(result.prompt).toContain("ERROR-FIX-LOOP"); // Section header is uppercased
        expect(result.activeSkillNames).toContain("error-fix-loop"); // Skill name stays lowercase
        expect(result.estimatedTokens).toBeGreaterThan(0);
    });
});
