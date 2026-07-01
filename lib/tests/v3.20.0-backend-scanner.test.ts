/**
 * v3.20.0 — 后端语言扫描器测试
 *
 * 覆盖 backend-scanner 中 Node.js / Go / Rust 规则与 CLI --module backend 集成。
 */

import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backendRules } from "../src/scanners/backend-scanner.js";
import type { Rule } from "../src/types.js";
import { createMinimalContext, createTempProject, cleanupTempProject, writeProjectFile } from "./helpers.js";

const CLI_PATH = resolve(__dirname, "../bin/fg-core.js");

function runCLI(cwd: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execSync(`node ${CLI_PATH} ${args.join(" ")}`, {
            encoding: "utf-8",
            timeout: 10000,
            cwd,
        });
        return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout || "",
            stderr: err.stderr || "",
            exitCode: err.status ?? 1,
        };
    }
}

function getRule(id: string): Rule {
    const rule = backendRules.find((r) => r.id === id);
    if (!rule) throw new Error(`Rule not found: ${id}`);
    return rule;
}

describe("v3.20.0 backend scanner", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    describe("node.js rules", () => {
        it("backend-node-unhandled-async reports await without try/catch", () => {
            const rule = getRule("backend-node-unhandled-async");
            const ctx = createMinimalContext(
                "async function handler(req, res) {\n  const user = await db.getUser(req.id);\n}",
                join(tempDir, "server.ts")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-node-unhandled-async");
        });

        it("backend-node-unhandled-async ignores await inside try/catch", () => {
            const rule = getRule("backend-node-unhandled-async");
            const ctx = createMinimalContext(
                "async function handler() {\n  try {\n    const user = await db.getUser();\n  } catch (e) {\n    console.error(e);\n  }\n}",
                join(tempDir, "server.ts")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });

        it("backend-node-dangerous-eval reports eval", () => {
            const rule = getRule("backend-node-dangerous-eval");
            const ctx = createMinimalContext(
                "const result = eval(userInput);",
                join(tempDir, "server.js")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-node-dangerous-eval");
            expect(issues[0].severity).toBe("critical");
        });

        it("backend-node-dangerous-eval reports new Function", () => {
            const rule = getRule("backend-node-dangerous-eval");
            const ctx = createMinimalContext(
                "const fn = new Function('a', 'b', 'return a+b');",
                join(tempDir, "server.js")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-node-dangerous-eval");
        });

        it("backend-node-hardcoded-secret reports api key assignment", () => {
            const rule = getRule("backend-node-hardcoded-secret");
            const ctx = createMinimalContext(
                "const apiKey = 'sk-1234567890abcdef';",
                join(tempDir, "config.ts")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-node-hardcoded-secret");
        });

        it("backend-node-hardcoded-secret ignores env var reference", () => {
            const rule = getRule("backend-node-hardcoded-secret");
            const ctx = createMinimalContext(
                "const apiKey = process.env.API_KEY;",
                join(tempDir, "config.ts")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });
    });

    describe("go rules", () => {
        it("backend-go-panic-in-handler reports panic inside http handler", () => {
            const rule = getRule("backend-go-panic-in-handler");
            const ctx = createMinimalContext(
                "func Handler(w http.ResponseWriter, r *http.Request) {\n  if err != nil {\n    panic(err)\n  }\n}",
                join(tempDir, "handler.go")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-go-panic-in-handler");
        });

        it("backend-go-ignored-error reports unhandled _ error", () => {
            const rule = getRule("backend-go-ignored-error");
            const ctx = createMinimalContext(
                "func main() {\n  _, err := db.Exec(query)\n  fmt.Println(\"done\")\n}",
                join(tempDir, "main.go")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-go-ignored-error");
        });

        it("backend-go-ignored-error ignores checked error", () => {
            const rule = getRule("backend-go-ignored-error");
            const ctx = createMinimalContext(
                "func main() {\n  _, err := db.Exec(query)\n  if err != nil {\n    log.Fatal(err)\n  }\n}",
                join(tempDir, "main.go")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });

        it("backend-go-hardcoded-secret reports token constant", () => {
            const rule = getRule("backend-go-hardcoded-secret");
            const ctx = createMinimalContext(
                "const accessToken = \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\"",
                join(tempDir, "config.go")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-go-hardcoded-secret");
        });
    });

    describe("rust rules", () => {
        it("backend-rust-unwrap-in-request reports unwrap in handler", () => {
            const rule = getRule("backend-rust-unwrap-in-request");
            const ctx = createMinimalContext(
                '#[get(\"/users/{id}\")]\nasync fn get_user_handler(path: web::Path<(i64,)>) -> impl Responder {\n  let user = db::find(path.0).unwrap();\n  HttpResponse::Ok().json(user)\n}',
                join(tempDir, "handler.rs")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-rust-unwrap-in-request");
        });

        it("backend-rust-unwrap-in-request reports expect in handler", () => {
            const rule = getRule("backend-rust-unwrap-in-request");
            const ctx = createMinimalContext(
                '#[post(\"/orders\")]\nasync fn create_order_handler(body: web::Json<Order>) -> impl Responder {\n  let order = body.into_inner();\n  let id = db::insert(order).expect(\"insert failed\");\n  HttpResponse::Ok().json(id)\n}',
                join(tempDir, "handler.rs")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-rust-unwrap-in-request");
        });

        it("backend-rust-hardcoded-secret reports api key const", () => {
            const rule = getRule("backend-rust-hardcoded-secret");
            const ctx = createMinimalContext(
                'static API_KEY: &str = "secret-api-key-12345";',
                join(tempDir, "config.rs")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-rust-hardcoded-secret");
        });

        it("backend-rust-unsafe-block reports unsafe block", () => {
            const rule = getRule("backend-rust-unsafe-block");
            const ctx = createMinimalContext(
                "fn raw() {\n  unsafe {\n    let _ = std::ptr::null::<i32>();\n  }\n}",
                join(tempDir, "raw.rs")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("backend-rust-unsafe-block");
            expect(issues[0].severity).toBe("suggestion");
        });
    });

    describe("cli integration", () => {
        it("cli --module backend scans go files", () => {
            writeProjectFile(tempDir, "handler.go", "func Handler(w http.ResponseWriter, r *http.Request) {\n  panic(\"bad\")\n}\n");
            writeProjectFile(tempDir, "package.json", JSON.stringify({ name: "test" }));
            const result = runCLI(tempDir, [".", "--module", "backend", "--files", "**/*.go", "--no-cache"]);
            expect(result.stdout).toContain("backend-go-panic-in-handler");
            expect(result.exitCode).toBe(0);
        });

        it("cli --module backend scans rust files", () => {
            writeProjectFile(tempDir, "main.rs", '#[get("/")]\nasync fn handler() {\n  let _ = db::load().unwrap();\n}\n');
            writeProjectFile(tempDir, "package.json", JSON.stringify({ name: "test" }));
            const result = runCLI(tempDir, [".", "--module", "backend", "--files", "**/*.rs", "--no-cache"]);
            expect(result.stdout).toContain("backend-rust-unwrap-in-request");
            expect(result.exitCode).toBe(0);
        });
    });
});
